/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */
// @ts-nocheck
'use strict';

const Interval = require(__dirname + '/Interval.js');

/*
 * structure containing all Info of this machine
 */
let machine = {
    //  aix,darwin,freebsd,linux,openbsd,sunos,win32
    platform: '',
    // packageManager on Linux
    pkgMgr: '',
    // amount of updates: maintained by coding call function getListOfUpdates(false|true)
    numUpdates: 0,
    // flag whether machine needs reboot: maintained by coding call function getListOfUpdates(false|true)
    needsReboot: false,
    hostname: ''
};
 
/**
 * Class Interval4 implements the logic used in interval 4 by moma
 *  (c) 2019 AWhiteKnight
 */
class Interval4 extends Interval {
    constructor() {
        super();
        // needs access to os information
        const os = require('os');
        // we read from file system
        const fs = require('fs');
      
        // init variables
        machine.platform =  os.platform();
        machine.hostname = os.hostname();
      
        switch(machine.platform) {
            case 'linux':
                // RedHat Package-Manager zypper
                if(fs.existsSync('/usr/bin/zypper')) {
                    machine.pkgMgr = 'zypper';
                // Debian Package-Manager apt
                } else if (fs.existsSync('/usr/bin/apt')) {
                    machine.pkgMgr = 'apt';
                // RedHat Package-Manager yum
                } else if (fs.existsSync('/usr/bin/yum')) {
                    machine.pkgMgr = 'yum';
                // unknown
                } else {
                machine.pkgMgr = '';
                }
                break;
            case 'darwin':
            case 'win32':
            default:
                machine.pkgMgr = '';
                break;
        }
    }

    run(adapter, init) {
        try {
            adapter.log.debug('running Interval4');
            if(adapter.config.updates) {
                this.getListOfUpdates(adapter);
            }
    
            if(adapter.config.checkBatteries) {
                this.doCheckBatteries(adapter);
            }
            this.osInfo(adapter, init);
            this.uuid(adapter, init);
            this.shell(adapter, init);
            this.versions(adapter, init);
        } catch(err) {
            adapter.log.error('Error in interval 4: ' + err);
        }
    }
      
    /**
     * @param {string[] | never[]} list
    */
    maintainStates(list, adapter) {
        // needs access to state definitions
        const defs = require(__dirname + '/definitions');

        try {
            machine.needsReboot = false;
            machine.numUpdates = list.length;
            if(machine.pkgMgr === 'apt') {
                // check whether /var/run/reboot-required existiert
                if(require('fs').existsSync('/var/run/reboot-required')) {
                    machine.needsReboot = true;
                }
            } else {
                adapter.log.info('Package-Manager not initialized!');
            }

            // maintain states of this machine
            adapter.setForeignState(defs.hostEntryHasUpdates, {val: machine.numUpdates, ack: true});
            adapter.setForeignState(defs.hostEntryNeedsReboot, {val: machine.needsReboot, ack: true});
            adapter.setForeignState(defs.hostEntryListOfUpdates, {val: list.join(', '), ack: true});

            // maintain global states hostNeedsReboot / hostNeedsUpdate properly regarding other machines
            let hostNeedsReboot = machine.needsReboot;
            let hostNeedsRebootList = '';
            if(machine.needsReboot == true) {
                hostNeedsRebootList = machine.hostname + ' ';
            }
            let hostNeedsUpdate = (machine.numUpdates > 0);
            let hostNeedsUpdateList = '';
            if(machine.numUpdates > 0) {
                hostNeedsUpdateList = machine.hostname + ' ';
            }

            adapter.getForeignObjects(defs.hostsList + '.*', 'state', function(err, states) {
                if(err) {
                    adapter.log.error(err);
                } else {
                    for (let j in states) {
                        let stateid = states[j]._id.split('.').pop();
                        if(stateid == 'needsReboot') {
                            adapter.getForeignState(states[j]._id, function(err, state) {
                                if(err) {
                                    adapter.log.error(err);
                                } else {
                                    if(state.val == true) {
                                        hostNeedsReboot = true;
                                        hostNeedsRebootList += states[j]._id + ' ';
                                    }
                                }
                            });
                        } else if(stateid == 'numUpdates') {
                                adapter.getForeignState(states[j]._id, function(err, state) {
                                if(err) {
                                    adapter.log.error(err);
                                } else {
                                    if(state.val > 0) {
                                        hostNeedsUpdate = true;
                                        hostNeedsUpdateList += states[j]._id + ' ';
                                    }
                                }
                            });
                        }
                    }
                }
            });

            // set values
            adapter.setForeignState(defs.hostNeedsUpdate, {val: hostNeedsUpdate, ack: true});
            adapter.setForeignState(defs.hostNeedsUpdateList, {val: hostNeedsUpdateList, ack: true});
            adapter.setForeignState(defs.hostNeedsReboot, {val: hostNeedsReboot, ack: true});
            adapter.setForeignState(defs.hostNeedsRebootList, {val: hostNeedsRebootList, ack: true});
        } catch (error) {
            adapter.log.error('Error maintaining states / ' + error);
        }
    }
      
    /*
     * fetches the list of updates available for the machine
     * parameter: long - if set to true, the full information will be returned, otherweise only package name
     * format: [package-info|package-info|...]
    */
    getListOfUpdates(adapter) {
      
        if(machine.pkgMgr === undefined || machine.pkgMgr === null) {
            adapter.log.debug('Package-Manager not initialized!');
            return;
        }
      
        // we want to spawn commands
        const cmd = require('child_process');
      
        let list = [];
        switch(machine.platform) {
          case 'linux':
            // TODO implement for different package managers
            if(machine.pkgMgr === 'apt') {
              // debian packages with apt 
              cmd.execSync('sudo apt update 2> /dev/null');
              let lines = cmd.execSync('sudo apt list --upgradeable 2> /dev/null').toString().split('\n');
              let k = 0;
              let pkg;
              for(let i = 0; i < lines.length; i++) {
                if(lines[i].length > 16) {
                  pkg = lines[i].toString().split('/');
                  if(pkg != undefined && pkg[0] != undefined) {
                    list[k++] = pkg[0].trim();
                  }
                }
              }
            } else if(machine.pkgMgr === 'yum') {
              let lines = cmd.execSync('sudo yum check-update 2> /dev/null').toString().split('\n');
              let k = 0;
              // TODO: wie arbeitet yum
              let pkg;
              for(let i = 0; i < lines.length; i++) {
                pkg = lines[i].toString().split('|');
                if(pkg != undefined && pkg[1] != undefined) {
                  list[k++] = pkg[1].trim();
                }
              }
            } else if(machine.pkgMgr === 'zypper') {
              // redhat packages with zypper
              cmd.execSync('sudo zypper refresh');
              let lines = cmd.execSync('sudo zypper list-updates 2> /dev/null').toString().split('\n');
              let k = 0;
              let pkg;
              for(let i = 5; i < lines.length; i++) {
                pkg = lines[i].toString().split('|');
                if(pkg != undefined && pkg[2] != undefined) {
                  list[k++] = pkg[2].trim();
                }
              }
            }
            break;
          case 'darwin':
          case 'win32':
          default:
            adapter.log.info('Update-Manager not implemented for ' + machine.platform);
            break;
        }
        // maintain machine state
        this.maintainStates(list, adapter);
    }
      
    /*
     * executes updates for the machine
    */
    doUpdates(adapter) {
        // we want to spawn commands
        const cmd = require('child_process');
      
        adapter.log.debug('executing updates');
      
        switch(machine.platform) {
          case 'linux':
            if(machine.pkgMgr === undefined || machine.pkgMgr === null) {
              adapter.log.debug('Package-Manager not initialized!');
              return;
            }
            // TODO implement for different package managers
            // TODO implement Auswertung von result
            let result = null;
            if(machine.pkgMgr === 'apt') {
              // debian packages with apt 
              cmd.execSync('sudo apt update');
              result = cmd.execSync('sudo apt full-upgrade -y 2> /dev/null').toString().split('\n');
            } else if(machine.pkgMgr === 'yum') {
              // TODO:redhat packages with yum / check for reboot: needs-restarting -r
              result = cmd.execSync('sudo yum update -y 2> /dev/null').toString().split('\n');
            } else if(machine.pkgMgr === 'zypper') {
              // opennsuse packages with zypper
              cmd.execSync('sudo zypper refresh');
              result = cmd.execSync('sudo zypper dup -y 2> /dev/null').toString().split('\n');
              // TODO check for reboot: needs-restarting -r or zypper ps -s
            }
            adapter.log.debug('update result: ' + result);
            // maintain machine state
            machine.numUpdates = 0;
            break;
          case 'darwin':
          case 'win32':
          default:
            adapter.log.info('Update-Manager not implemented for ' + machine.platform);
            break;
        }
        this.maintainStates([], adapter);
    }
      
    /*
     * schedules reboot for the machine
    */
    scheduleReboot(adapter) {
        // we want to spawn commands
        const cmd = require('child_process');
      
        adapter.log.debug('scheduling reboot');
      
        // TODO implement Auswertung von result
        switch(machine.platform) {
            case 'linux':
                let result = cmd.execSync('sudo /sbin/reboot 5' /*2> /dev/null*/).toString().split('\n');
                break;
            case 'darwin':
            case 'win32':
            default:
                adapter.log.info('reboot not implemented for ' + machine.platform);
                break;
        }
    }
      
    /*
     * Function checks battery state for all devices in every adapter
     * Currently implemented:
     *  + boolean values
     *    - LOWBAT / LOWBAT_ALARM     (e.g. Homematic classic and CUXD)
     *    - LOW_BAT / LOW_BAT_ALARM   (e.g. Homematic IP)
     */
    doCheckBatteries(adapter) {
        // needs access to state definitions
        const defs = require(__dirname + '/definitions');

        //let batteryStates = ['LOWBAT', 'LOW_BAT'];
        //let alarmStates = ['LOWBAT_ALARM', 'LOW_BAT_ALARM'];
        
        let deviceList = '';
        let isDevice = false;
      
        adapter.getForeignObjects('*.SDS_P1', 'state', function(err, stateslist) {
            if(err) {
                adapter.log.error(err);
            } else {
                for (let j in stateslist) {
                    let stateid = stateslist[j]._id.split('.').pop();
                    if(stateid == 'LOWBAT' || stateid == 'LOW_BAT') {
                        adapter.getForeignState(stateslist[j]._id, function(err, state) {
                            if(err) {
                                adapter.log.error(err);
                            } else {
                                if(state.val == true) {
                                    isDevice = true;
                                    deviceList += stateslist[j]._id;
                                }
                            }
                        });
                    }
                }
            }
        });
        adapter.setForeignState(defs.deviceNeedsBatteryChange, {val: isDevice, ack: true});
        adapter.setForeignState(defs.deviceNeedsBatteryChangeList, {val: deviceList, ack: true});
    }

    osInfo(adapter, init) {
        if(adapter.config.osInfo) {
            Interval.getSI().osInfo(function(data) {
                Interval.showData(data, 'osInfo', adapter, init);
            });
        }
    }
    
    uuid(adapter, init) {
        if(adapter.config.uuid) {
            Interval.getSI().uuid(function(data) {
                Interval.showData(data, 'uuid', adapter, init);
            });
        }
    }
    
    shell(adapter, init) {
        if(adapter.config.shell) {
            Interval.getSI().shell(function(data) {
                Interval.showData(data, 'shell', adapter, init);
            });
        }
    }
    
    versions(adapter, init) {
        if(adapter.config.versions) {
            Interval.getSI().versions(function(data) {
                Interval.showData(data, 'versions', adapter, init);
            });
        }
    }

// end of class
}

module.exports = Interval4;