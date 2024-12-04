'use strict';

const { Device } = require('homey');
const modbus = require('jsmodbus');
const net = require('net');
const decodeData = require('../../lib/decodeData.js');
const socket = new net.Socket();




class MennekesHCC3ModbusStorageDevice extends Device {
	/*constructor?*/
    async onInit() {
        let self = this;
		
        // Register device triggers, as defined in ./driver.flow.compose.json
        self._changedHCCOperationalStatus = self.homey.flow.getDeviceTriggerCard('changedHCCOperationalStatus');		//As defined in driver.flow.compose.json
        self._changedHCCSessionYield = self.homey.flow.getDeviceTriggerCard('changedHCCSessionYield');
        self._changedHCCChargePower = self.homey.flow.getDeviceTriggerCard('changedHCCChargePower');
		self._changedHCCChargerLimit = self.homey.flow.getDeviceTriggerCard('changedHCCChargerLimit');

		
		
        let options = {
            'host': self.getSetting('address'),
            'port': self.getSetting('port'),
            'unitId': 1,
            'timeout': 2000,
            'autoReconnect': true,
            'reconnectTimeout': self.getSetting('polling'),
            'logLabel': 'Mennekes Amtron HCC3',
            'logLevel': 'error',
            'logEnabled': false
        }

        let client = new modbus.client.TCP(socket, 255)
        socket.connect(options);
		
		let current_limit = 0;
		
		this.setupCapabilityListeners();
		//this._registerFlows(self, client);
		
        socket.on('connect', () => {
            self.log('Socket connected ...');
			
			//Fast polling for current or power limitation feedback
			self.pollingInterval_fast = self.homey.setInterval(() => {
                Promise.all([                   
					client.readHoldingRegisters(1025, 1), 	/*AC current limit*/    			
					client.readHoldingRegisters( 782,  4) 	/*AC session meter + power consumption */    			

					
				]).then((results) => {
						current_limit 	 = 									results[0].response._body._valuesAsArray[0]							;	//actual current limit in A, read back from the charger
						//					self.log("current_limit " + current_limit	);					
					
						let session_yield	 = decodeData.decodeU32(		results[1].response._body._valuesAsArray.slice(0,1), 0, 0) / 1000.0	;//Total energy in kWh
						//self.log("tot_yield "+tot_yield);
						
						let tot_power		 = decodeData.decodeU32(		results[1].response._body._valuesAsArray.slice(2,3), 0, 0) /1.0000	;//Total charging energy in kW
						//self.log("tot_power "+tot_power);
						
						// MEASURE_POWER: MOMENTAL (total) CHARGING POWER
						if (self.getCapabilityValue('measure_power.charge') != tot_power) {
							self.setCapabilityValue('measure_power.charge', tot_power)
								.then(function () {

									let tokens = {
										charging: tot_power
									}
									self._changedHCCChargePower.trigger(self, tokens, {}).catch(error => { self.error(error) });

								}).catch(reason => {
									self.error(reason);
								});
						}
						
						
						
						 // current limit
						if (self.getCapabilityValue('measure_current.ChargerLimit') != current_limit) {
							self.setCapabilityValue('measure_current.ChargerLimit', current_limit)
								.then(function () {

									let tokens = {
										current: current_limit
									}
									self._changedHCCChargerLimit.trigger(self, tokens, {}).catch(error => { self.error(error) });

								}).catch(reason => {
									self.error(reason);
								});
						}


				}).catch((err) => {
						self.log(err);
					})
            }, 500);
        
			
			
            self.pollingInterval = self.homey.setInterval(() => {
                Promise.all([
                    client.readHoldingRegisters(774, 1),	/*charger operational code*/
					client.readHoldingRegisters( 782,  4) 	/*AC session meter + power consumption */    			
					client.readHoldingRegisters(1025, 1),	/*EV_Max_Current (mA)*/


                ]).then((results) => {				
					
                    let operational_code = 								results[0].response._body._valuesAsArray[0]				;	/*charger operational code*/	
					self.log("operational code " + operational_code	);
					
	
//                    let EV_ID 			 = decodeData.decodeHexString(	results[1].response._body._valuesAsArray )				;		/*EV ID, to HEX string*/
//					self.log("EV_ID: "+EV_ID);
					
//					let EV_capability	 = 								results[2].response._body._valuesAsArray[0]				;//Max Current info from EV
//					self.log("Car MAX current capability" + EV_capability);
					
					let session_yield		 = decodeData.decodeU32(	results[1].response._body._valuesAsArray.slice(0,1), 0, 0)	/1000		;//session charged energy (kWh)
					self.log("Session charged energy HiRes"+session_yield);
					
//					let session_duration =	 decodeData.decodeU32(		results[2].response._body._valuesAsArray.slice(3,5), 0, 0)	/60	;		//minutes
//					self.log("Session duration "+ session_duration);
					
					let Charger_curent_max	 = 							results[2].response._body._valuesAsArray[0]					;	//charger max current set by operator
					self.log("Charger_curent_max "+Charger_curent_max);
					

                    // OPERATIONAL STATUS
					let state = self.operational_string(operational_code);				
					//self.log( "operation_status: "+ self.homey.__(state) );
                    if (self.getCapabilityValue('operational_status') != self.homey.__(state) ) {				
                        self.setCapabilityValue('operational_status', self.homey.__(state) )
                            .then(function () {

                                let tokens = {
                                    status: self.homey.__(state)
                                }
                                self._changedHCCOperationalStatus.trigger(self, tokens, {}).catch(error => { self.error(error) });	//Tokens are made availbe in Flows as 'global sources'. For tokens see driver.flow.compose.json

                            }).catch(reason => {
                                self.error(reason);
                            });

                    }
					

                    // BATTERY, session charged
                    if (self.getCapabilityValue('meter_power.session') != session_yield) {
                        self.setCapabilityValue('meter_power.session', session_yield)
                            .then(function () {

                                let tokens = {
                                    energy: session_yield
                                }
                                self._changedHCCSessionYield.trigger(self, tokens, {}).catch(error => { self.error(error) });

                            }).catch(reason => {
                                self.error(reason);
                            });
                    }
					

                }).catch((err) => {
                    self.log(err);
                })
            }, self.getSetting('polling') * 1000);
        });

		/*############# Init Action flowcards ###############*/
		//set_target_current
		const set_target_current = self.homey.flow.getActionCard('set_target_current');
		set_target_current.registerRunListener(async (args) => {
			//					self.log(`Action 'set_target_current' triggered with values: `+args.current );
			
			// Adjust active power to be <= max power			
			let current = parseInt(args.current);

				current = Math.min(32, current);				
				current = Math.max( 0, current);
				
				/*If current is lower than lowest threshold of charger, make it ZERO to pause charging*/		
				if(current < 6){
					current = 0;
					self.log(">> Charging is PAUSED <<");		
				}
				//					self.log("Write max current "+current);		
				return client.writeSingleRegister(1025, current).then((result) => {
					   //					self.log("                ... write_success");
					  return Promise.resolve(true);
				  }).catch(reason => {
				return Promise.reject(reason);
			  });
		});
		
        socket.on('error', (err) => {
            self.log(err);
            socket.end();
        })

        socket.on('close', () => {
            self.log('Client closed, retrying in 5 seconds');
			self.homey.clearInterval(self.pollingInterval_fast);
            self.homey.clearInterval(self.pollingInterval);
            self.homey.setTimeout(() => {
                socket.connect(options);
                self.log('Reconnecting now ...');
            }, 5000)
        })

    }
	
	async setupCapabilityListeners() {
		

    }
	
	/*Info from Charger @0774*/
	operational_string(operational_code){
		let state="";
		switch(operational_code){						
				case 0:  state = 'Idle';	 break;
				case 1:  state = 'Standby Authorize';	 break;
				case 2:  state = 'Standby Connect';	 break;
				case 3:  state = 'Charging';	 break;
				case 4:  state = 'Paused';	 break;
				case 5:  state = 'Terminated';	 break;
				case 6:  state = 'Error';	 break;
				default: state= 'Unknown';						
			}
		return state;
	}				
	
	/*Info directly from EV*/
	EV_control_state_string(state){
		switch(state){
			case 1: return "Standby";
			case 2: return "Vehicle detected";
			case 3: return "Ready";
			case 4: return "With ventilation";
			case 5: return "No power";
			case 6: return "Error";
			default : return "Error";
		}
	}
}

module.exports = MennekesHCC3ModbusStorageDevice;
