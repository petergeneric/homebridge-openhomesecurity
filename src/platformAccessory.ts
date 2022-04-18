import {Service, PlatformAccessory} from 'homebridge';

import {OHSPlatform} from './platform';
import {OHSClient, OHSSensorState} from "./ohs";

export class OHSPIRAccessory {
    private service: Service;
    private readonly name: string;
    private currentMotionState: boolean = false;

    constructor(
        private readonly ohs: OHSClient,
        private readonly platform: OHSPlatform,
        private readonly accessory: PlatformAccessory,
    ) {

        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'OpenHomeSecurity')
            //.setCharacteristic(this.platform.Characteristic.SerialNumber, 'Default-Serial')
            .setCharacteristic(this.platform.Characteristic.Model, '1.0');

        // get the MotionSensor service if it exists, otherwise create a new MotionSensor service
        // you can create multiple services for each accessory
        // see https://developers.homebridge.io/#/service/MotionSensor
        this.service = this.accessory.getService(this.platform.Service.MotionSensor) || this.accessory.addService(this.platform.Service.MotionSensor);

        this.name = accessory.context.device;

        // set the service name, this is what is displayed as the default name on the Home app
        // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
        this.service.setCharacteristic(this.platform.Characteristic.Name, this.name);

        // Subscribe to new readings for this sensor
        ohs.onNewReading.subscribe(reading => {
            if (reading.name == this.name) {
                this.onNewReading(reading)
            }
        });
    }

    private onNewReading(reading: OHSSensorState) {
        const motionDetected = reading.alarming;

        // push the new value to HomeKit
        this.service.updateCharacteristic(this.platform.Characteristic.MotionDetected, motionDetected);

        if (this.currentMotionState != motionDetected) {
            if (motionDetected)
                this.platform.log.debug('Motion on ', this.name, ' note: ', reading.note);
            else
                this.platform.log.debug('No motion ', this.name, ' note: ', reading.note);
        }

        this.currentMotionState = motionDetected;
    }
}
