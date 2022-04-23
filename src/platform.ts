import {
	API,
	DynamicPlatformPlugin,
	Logger,
	PlatformAccessory,
	PlatformConfig,
	Service,
	Characteristic,
} from 'homebridge';

import {PLATFORM_NAME, PLUGIN_NAME} from './settings';
import {OHSPIRAccessory} from './platformAccessory';
import {OHSClient} from './ohs';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class OHSPlatform implements DynamicPlatformPlugin {
	public readonly Service: typeof Service = this.api.hap.Service;
	public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

	// this is used to track restored cached accessories
	public readonly accessories: PlatformAccessory[] = [];

	private readonly ohs: OHSClient;

	constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
	) {
		this.log.debug('Finished initializing platform:', this.config.name);

		this.ohs = new OHSClient(log, this.config.endpoint, this.config.username, this.config.password);

		this.ohs.onNewSensor.subscribe((name) => this.discoveredDevice(name));
		this.ohs.onDelSensor.subscribe(name => this.log.warn('(NOT IMPLEMENTED) Sensor removed: ', name));

		this.api.on('didFinishLaunching', () => {
			this.ohs.start();
		});

		this.api.on('shutdown', () => {
			this.ohs.stop();
		});
	}

	/**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to setup event handlers for characteristics and update respective values.
     */
	configureAccessory(accessory: PlatformAccessory) {
		this.log.info('Loading accessory from cache:', accessory.displayName);

		// add the restored accessory to the accessories cache so we can track if it has already been registered
		this.accessories.push(accessory);
	}

	discoveredDevice(name: string) {

		// generate a unique id for the accessory this should be generated from
		// something globally unique, but constant, for example, the device serial
		// number or MAC address
		const uuid = this.api.hap.uuid.generate('OpenHomeSecurity:' + name);

		// see if an accessory with the same uuid has already been registered and restored from
		// the cached devices we stored in the `configureAccessory` method above
		const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

		if (existingAccessory) {
			// the accessory already exists
			this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

			// if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
			// existingAccessory.context.device = device;
			// this.api.updatePlatformAccessories([existingAccessory]);

			// create the accessory handler for the restored accessory
			// this is imported from `platformAccessory.ts`
			new OHSPIRAccessory(this.ohs, this, existingAccessory);

			// it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
			// remove platform accessories when no longer present
			// this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
			// this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
		} else {
			// the accessory does not yet exist, so we need to create it
			this.log.info('Adding new accessory:', name);

			// create a new accessory
			const accessory = new this.api.platformAccessory(name, uuid);

			// store a copy of the device object in the `accessory.context`
			// the `context` property can be used to store any data about the accessory you may need
			accessory.context.device = name;

			// create the accessory handler for the newly create accessory
			new OHSPIRAccessory(this.ohs, this, accessory);

			// link the accessory to your platform
			this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
		}
	}
}
