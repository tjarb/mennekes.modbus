'use strict';

const { Device } = require('homey');
const modbus = require('jsmodbus');
const net = require('net');
const decodeData = require('../../lib/decodeData.js');
const socket = new net.Socket();




class MennekesModbusStorageDevice extends Device {
	/*constructor?*/
    async onInit() {
        let self = this;
		
        // Register device triggers, as defined in ./driver.flow.compose.json
        self._changedOperationalStatus = self.homey.flow.getDeviceTriggerCard('changedOperationalStatus');		//As defined in driver.flow.compose.json
        self._changedSessionYield = self.homey.flow.getDeviceTriggerCard('changedSessionYield');
        self._changedChargePower = self.homey.flow.getDeviceTriggerCard('changedChargePower');
        self._changedCurrent_L1 = self.homey.flow.getDeviceTriggerCard('changedCurrentL1');
		self._changedPower_L1 = self.homey.flow.getDeviceTriggerCard('changedPowerL1');
		self._changedVoltage_L1 = self.homey.flow.getDeviceTriggerCard('changedVoltageL1');
		self._changedChargerLimit = self.homey.flow.getDeviceTriggerCard('changedChargerLimit');
		self._changedEV_capability = self.homey.flow.getDeviceTriggerCard('changedEV_capability');
		self._changedYield = self.homey.flow.getDeviceTriggerCard('changedYield');
        self._changedRequiredEnergy = self.homey.flow.getDeviceTriggerCard('changedRequiredEnergy');
		
		
        let options = {
            'host': self.getSetting('address'),
            'port': self.getSetting('port'),
            'unitId': 1,
            'timeout': 2000,
            'autoReconnect': true,
            'reconnectTimeout': self.getSetting('polling'),
            'logLabel': 'Mennekes Amtron',
            'logLevel': 'error',
            'logEnabled': false
        }

        let client = new modbus.client.TCP(socket, 3)
        socket.connect(options);
		
		let current_limit = 0;
		
		this.setupCapabilityListeners();
		//this._registerFlows(self, client);
		
        socket.on('connect', () => {
            self.log('Socket connected ...');
			
			//Fast polling for current or power limitation feedback
			self.pollingInterval_fast = self.homey.setInterval(() => {
                Promise.all([                   
					client.readHoldingRegisters(1000, 1), 	/*AC measurements, read complete page*/    			
					client.readHoldingRegisters(200, 28) 	/*AC measurements, read complete page*/    			
					
				]).then((results) => {
						current_limit 	 = 									results[0].response._body._valuesAsArray[0]							;	//actual current limit in A, read back from the charger
						self.log("current_limit " + current_limit	);
					
						let power_L1		 = decodeData.decodeU32(		results[1].response._body._valuesAsArray.slice(6,8), 0, 0)	/1000	;//Power in L1 (kWh)
						//self.log("power_L1 "+power_L1);
						
						let power_L2		 = decodeData.decodeU32(		results[1].response._body._valuesAsArray.slice(8,10), 0, 0)	/1000		;
						//self.log("power_L2 "+power_L2);
						
						let power_L3		 = decodeData.decodeU32(		results[1].response._body._valuesAsArray.slice(10,12), 0, 0)/1000			;
						//self.log("power_L3 "+power_L3);
						
						let current_L1		 = decodeData.decodeU32(		results[1].response._body._valuesAsArray.slice(12,14), 0, 0) /1000.0	;	//Current in L1 (A)
						//self.log("current_L1 "+current_L1);
						
						let current_L2		 = decodeData.decodeU32(		results[1].response._body._valuesAsArray.slice(14,16), 0, 0) /1000.0	;
						//self.log("current_L2 "+current_L2);
						
						let current_L3		 = decodeData.decodeU32(		results[1].response._body._valuesAsArray.slice(16,18), 0, 0) /1000.0	;
						//self.log("current_L3 "+current_L3);
						
						let tot_yield		 = decodeData.decodeU32(		results[1].response._body._valuesAsArray.slice(18,20), 0, 0) / 1000.0	;//Total energy in kWh
						//self.log("tot_yield "+tot_yield);
						
						let tot_power		 = decodeData.decodeU32(		results[1].response._body._valuesAsArray.slice(20,22), 0, 0) /1000.0	;//Total charging energy in kW
						//self.log("tot_power "+tot_power);
						
						// MEASURE_POWER: MOMENTAL (total) CHARGING POWER
						if (self.getCapabilityValue('measure_power.charge') != tot_power) {
							self.setCapabilityValue('measure_power.charge', tot_power)
								.then(function () {

									let tokens = {
										charging: tot_power
									}
									self._changedChargePower.trigger(self, tokens, {}).catch(error => { self.error(error) });

								}).catch(reason => {
									self.error(reason);
								});
						}
						
						// POWER on Grid Line 1
						if (self.getCapabilityValue('measure_power.L1') != tot_power) {
							self.setCapabilityValue('measure_power.L1', tot_power)
								.then(function () {

									let tokens = {
										power: power_L1
									}
									self._changedPower_L1.trigger(self, tokens, {}).catch(error => { self.error(error) });

								}).catch(reason => {
									self.error(reason);
								});
						}
						
						// Current on Grid Line 1
						if (self.getCapabilityValue('measure_current.L1') != current_L1) {
							self.setCapabilityValue('measure_current.L1', current_L1)
								.then(function () {

									let tokens = {
										current: current_L1	/*defined as Tokens*/
									}
									self._changedCurrent_L1.trigger(self, tokens, {}).catch(error => { self.error(error) });	/*Defined above this file*/

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
									self._changedChargerLimit.trigger(self, tokens, {}).catch(error => { self.error(error) });

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
                    client.readHoldingRegisters(104, 1),	/*charger operational code*/
                    client.readHoldingRegisters(741, 6),	/*EV ID*/
					client.readHoldingRegisters(715, 5),	/*EV_Session charged energy (wh), Session duration*/
					client.readHoldingRegisters(134, 1),	/*EV_Max_Current (mA)*/
					client.readHoldingRegisters(122, 1),	/*EV_state Control Pilot vehi-cle state in deci-mal format*/
					client.readHoldingRegisters(200, 28), 	/*AC measurements, read complete page*/                
					client.readHoldingRegisters(713, 2) 	/*EV_energy_required*/                


                ]).then((results) => {				
					
                    let operational_code = 								results[0].response._body._valuesAsArray[0]				;	/*charger operational code*/	
					//self.log("operational code " + operational_code	);
					
	
                    let EV_ID 			 = decodeData.decodeHexString(	results[1].response._body._valuesAsArray )				;		/*EV ID, to HEX string*/
					self.log("EV_ID: "+EV_ID);
					
					let EV_capability	 = 								results[2].response._body._valuesAsArray[0]				;//Max Current info from EV
					self.log("Car MAX current capability" + EV_capability);
					
					let session_yield		 = decodeData.decodeU32(	results[2].response._body._valuesAsArray.slice(1,3), 0, 0)	/1000		;//session charged energy (kWh)
					self.log("Session charged energy HiRes"+session_yield);
					
					let session_duration =	 decodeData.decodeU32(		results[2].response._body._valuesAsArray.slice(3,5), 0, 0)	/60	;		//minutes
					self.log("Session duration "+ session_duration);
					
					let Charger_curent_max	 = 							results[3].response._body._valuesAsArray[0]					;	//charger max current set by operator
					self.log("Charger_curent_max "+Charger_curent_max);
					
					let EV_control_state = 								results[4].response._body._valuesAsArray[0]				;	//EV needs to support this
					self.log("EV_control_state "+EV_control_state + " = " + self.EV_control_state_string(EV_control_state)  );
			
					
					
/*					let power_L1		 = decodeData.decodeU32(		results[5].response._body._valuesAsArray.slice(6,8), 0, 0)	/1000	;//Power in L1 (kWh)
					//self.log("power_L1 "+power_L1);
					
					let power_L2		 = decodeData.decodeU32(		results[5].response._body._valuesAsArray.slice(8,10), 0, 0)	/1000		;
					//self.log("power_L2 "+power_L2);
					
					let power_L3		 = decodeData.decodeU32(		results[5].response._body._valuesAsArray.slice(10,12), 0, 0)/1000			;
					//self.log("power_L3 "+power_L3);
					
					let current_L1		 = decodeData.decodeU32(		results[5].response._body._valuesAsArray.slice(12,14), 0, 0) /1000.0	;	//Current in L1 (A)
					//self.log("current_L1 "+current_L1);
					
					let current_L2		 = decodeData.decodeU32(		results[5].response._body._valuesAsArray.slice(14,16), 0, 0) /1000.0	;
					//self.log("current_L2 "+current_L2);
					
					let current_L3		 = decodeData.decodeU32(		results[5].response._body._valuesAsArray.slice(16,18), 0, 0) /1000.0	;
					//self.log("current_L3 "+current_L3);
*/					
					let tot_yield		 = decodeData.decodeU32(		results[5].response._body._valuesAsArray.slice(18,20), 0, 0) / 1000.0	;//Total energy in kWh
					//self.log("tot_yield "+tot_yield);
/*					
					let tot_power		 = decodeData.decodeU32(		results[5].response._body._valuesAsArray.slice(20,22), 0, 0) /1000.0	;//Total charging energy in kW
					//self.log("tot_power "+tot_power);
*/					
                    let voltage_L1		 = decodeData.decodeU32(		results[5].response._body._valuesAsArray.slice(22,24), 0, 0)			;//AC L1 voltage in Volt
					
					//self.log("voltage_L1 "+voltage_L1);
					
                    let voltage_L2		 = decodeData.decodeU32(		results[5].response._body._valuesAsArray.slice(24,26), 0, 0)			;
					let voltage_L3		 = decodeData.decodeU32(		results[5].response._body._valuesAsArray.slice(26,28), 0, 0)			;

					let EV_Req_energy	 = decodeData.decodeU32(		results[6].response._body._valuesAsArray, 0, 0) /1000.0	;//Total charging energy in kW
					self.log("EV_Req_energy "+EV_Req_energy);

                    // OPERATIONAL STATUS
					let state = self.operational_string(operational_code);				
					//self.log( "operation_status: "+ self.homey.__(state) );
                    if (self.getCapabilityValue('operational_status') != self.homey.__(state) ) {				
                        self.setCapabilityValue('operational_status', self.homey.__(state) )
                            .then(function () {

                                let tokens = {
                                    status: self.homey.__(state)
                                }
                                self._changedOperationalStatus.trigger(self, tokens, {}).catch(error => { self.error(error) });	//Tokens are made availbe in Flows as 'global sources'. For tokens see driver.flow.compose.json

                            }).catch(reason => {
                                self.error(reason);
                            });

                    }
					

                    // Energy required by the EV
                    if (self.getCapabilityValue('meter_power.required') != EV_Req_energy) {
                        self.setCapabilityValue('meter_power.required', EV_Req_energy)
                            .then(function () {

                                let tokens = {
                                    energy: EV_Req_energy
                                }
                                self._changedRequiredEnergy.trigger(self, tokens, {}).catch(error => { self.error(error) });

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
                                self._changedSessionYield.trigger(self, tokens, {}).catch(error => { self.error(error) });

                            }).catch(reason => {
                                self.error(reason);
                            });
                    }
					
					
						// Line1 voltage
						if (self.getCapabilityValue('measure_voltage.L1') != voltage_L1) {
							self.setCapabilityValue('measure_voltage.L1', voltage_L1)
								.then(function () {

									let tokens = {
										voltage: voltage_L1
									}
									self._changedVoltage_L1.trigger(self, tokens, {}).catch(error => { self.error(error) });

								}).catch(reason => {
									self.error(reason);
								});
						}

					 // total energy charger during lifetime
                    if (self.getCapabilityValue('meter_power.total') != tot_yield) {
                        self.setCapabilityValue('meter_power.total', tot_yield)
                            .then(function () {

                                let tokens = {
                                    yield: tot_yield
                                }
                                self._changedYield.trigger(self, tokens, {}).catch(error => { self.error(error) });

                            }).catch(reason => {
                                self.error(reason);
                            });
                    }
					
					 // total energy charger during lifetime
                    if (self.getCapabilityValue('measure_current.EV_capability') != EV_capability) {
                        self.setCapabilityValue('measure_current.EV_capability', EV_capability)
                            .then(function () {

                                let tokens = {
                                    current: EV_capability
                                }
                                self._changedEV_capability.trigger(self, tokens, {}).catch(error => { self.error(error) });

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
			self.log(`Action 'set_target_current' triggered with values: `+args.current );
			
			// Adjust active power to be <= max power			
			let current = parseInt(args.current);

				current = Math.min(32, current);				
				current = Math.max( 0, current);
				
				/*If current is lower than lowest threshold of charger, make it ZERO to pause charging*/		
				if(current < 6){
					current = 0;
					self.log(">> Charging is PAUSED <<");		
				}
				self.log("Write max current "+current);		
				return client.writeSingleRegister(1000, current).then((result) => {
					   self.log("                ... write_success");
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
	
	/*Info from Charger*/
	operational_string(operational_code){
		let state="";
		switch(operational_code){						
				case 0 : state = 'Available';		break;					
				case 1 : state = 'Occupied';		break;
				case 2 : state = 'Reserved';		break;													
				case 3 : state = 'Unavailable';		break;							
				case 4 : state = 'Faulted';			break;														
				case 5 : state = 'Preparing';		break;		
				case 6 : state = 'Charging';		break;	
				case 7 : state = 'Suspended';		break;	
				case 8 : state = 'Suspended';		break;								
				case 9 : state = 'Finishing';		break;	
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

module.exports = MennekesModbusStorageDevice;
