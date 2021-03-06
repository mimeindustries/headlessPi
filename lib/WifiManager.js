var iwlist = require('wireless-tools/iwlist');
var ifconfig = require('wireless-tools/ifconfig');
var iwconfig = require('wireless-tools/iwconfig');
var wpa_cli = require('wireless-tools/wpa_cli');
var WPAConf = require('wpa-supplicant-conf').WPAConf;
var child_process = require('child_process');
var HostapdConf = require('./HostapdConf');
var os = require('os');

var WifiManager = function(){
  var self = this;

  this.supportsWifiConfig = function(cb){
    // if we've got a uap0 to configure
    return (typeof os.networkInterfaces()['uap0'] !== 'undefined');
  }

  this.listAccessPoints = function(cb){
    iwlist.scan('wlan0', function(err, networks) {
      cb(err, networks);
    });
  }

  this.joinAccessPoint = function(ssid, password, cb){
    iwlist.scan('wlan0', (err, networks) => {
      if(err) return cb("Error joining network");
      for(var i=0; i<networks.length; i++){
        if(networks[i].ssid === ssid){
          self.setHostapChannel(networks[i].channel, (err) => {
            if(err) return cb("Error joining network");
            var wpaconf = new WPAConf('/etc/wpa_supplicant/wpa_supplicant.conf');
            wpaconf.addAndSave(ssid, password).then(() => {
              cb();
              setTimeout(function(){
                console.log("Rebooting");
                child_process.exec('reboot');
              }, 1000);
            });
          });
          return;
        }
      }
      cb("Error joining network");
    });
  }

  this.getStatus = function(cb){
    if(!this.supportsWifiConfig()) return cb(false);
    ifconfig.status('wlan0', function(err, ifstatus) {
      if (err) return cb(err);
      iwconfig.status('wlan0', function(err, iwstatus){
        cb(err, {ifstatus: ifstatus, iwstatus: iwstatus});
      });
    });
  }

  this.setHostapChannel = function(chan, cb){
    HostapdConf.read((conf) => {
      if(chan !== Number(conf.channel)){
        // Change the channel
        console.log("Changing channel");
        conf.channel = chan;
        HostapdConf.write(conf, (err) => {
          cb(err);
        });
      }else{
        cb();
      }
    });
  }

  this.rewriteHostapd = function(cb){
    // Check the network state
    wpa_cli.status('wlan0', function(err, status) {
      if(!err && status.wpa_state === 'COMPLETED'){
        // Get the current config
        HostapdConf.read((conf) => {
          // Make sure the channel matches
          var channel = (status.frequency - 2407)/5;
          if(channel !== Number(conf.channel)){
            // Change the channel
            console.log("Changing channel");
            conf.channel = channel;
            HostapdConf.write(conf, (err) => {
              cb(err);
            });
          }else{
            cb("No Change");
          }
        });
      }
    });
  }

  this.restartUap0 = function(cb){
    // Restart the network on the new channel
    ifconfig.down('uap0', (err) => {
      if(err) console.log(err);
      ifconfig.up({interface: 'uap0', ipv4_address: '10.10.10.10', ipv4_subnet_mask: '255.255.255.0', ipv4_broadcast: '10.10.10.255'}, (err) => {
        if(err) console.log(err);
        if(!err){
          console.log("AP Network Restarted");
        }
        if(cb) cb(err);
      });
    });
  }

  this.checkHostapdChannel = function(interval){
    this.rewriteHostapd((err) => {
      if(!err) restartUap0();
    });
    if(interval){
      setInterval(function(){ self.checkHostapdChannel() }, interval);
    }
  }
}

module.exports = new WifiManager();

