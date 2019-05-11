/* jshint -W097 */
/* jshint -W030 */
/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';
/**
 *
 * moma adapter - monitoring and maintenance of the machine the adapter is running on
 *  (c) 2018 AWhiteKnight
 *  @author: AWhiteKnight <awhiteknight@unity-mail.de>
 *  @license: MIT
 *
 * Created with help of @iobroker/create-adapter v1.10.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
/** @type {Moma | undefined} */
let adapter = undefined;
const duration = 3000;
const expiration = duration+20;
/** @type {NodeJS.Timeout | undefined} */
let timer = undefined;
/** @type {NodeJS.Timeout | undefined} */
let timer0 = undefined;
let duration0 = 1000;
/** @type {NodeJS.Timeout | undefined} */
let timer1 = undefined;
let duration1 = 10000;
/** @type {NodeJS.Timeout | undefined} */
let timer2 = undefined;
let duration2 = 60000;
/** @type {NodeJS.Timeout | undefined} */
let timer3 = undefined;
let duration3 = 3600000;
/** @type {NodeJS.Timeout | undefined} */
let timer4 = undefined;
let duration4 = 24*3600000;

let isInit = true;

let alive = require(__dirname + '/lib/definitions').hostEntryAlive;
let attention = require(__dirname + '/lib/definitions').hostEntryNeedsAttention;
let instance = require(__dirname + '/lib/definitions').hostEntryInstance;
let aHostNeedsAttention = require(__dirname + '/lib/definitions').hostNeedsAttention;

/*
 * call for update machine state
 */
function updateIntervalAlive() {
	// @ts-ignore
	adapter.setForeignState(alive, {val: true, ack: true, expire: expiration});
	// todo: implement check!
	// @ts-ignore
	adapter.setForeignState(attention, {val: false, ack: true});
	// @ts-ignore
	adapter.setForeignState(aHostNeedsAttention, {val: false, ack: true});

	timer = setTimeout(updateIntervalAlive, duration);
}

/*
 * call for updated states in interval_0 (default once per second)
 */
function updateInterval0() {
	// updating values
	const Interval0 = require(__dirname + '/lib/Interval0.js');
	new Interval0().run(adapter, isInit);
	timer0 = setTimeout(updateInterval0, duration0);
}

	
/*
 * call for updated states in interval_1 (default once per 10 sec)
 */
function updateInterval1() {
	// updating values
	const Interval1 = require(__dirname + '/lib/Interval1.js');
	new Interval1().run(adapter, isInit);
	timer1 = setTimeout(updateInterval1, duration1);
}
	
/*
 * call for updated states in interval_2 (default once per minute)
 */
function updateInterval2() {
	// updating values
	const Interval2 = require(__dirname + '/lib/Interval2.js');
	new Interval2().run(adapter, isInit);
	timer2 = setTimeout(updateInterval2, duration2);
}

/*
 * call for updated states in interval_3 (default once per hour)
 */
function updateInterval3() {
	// updating values
	const Interval3 = require(__dirname + '/lib/Interval3.js');
	new Interval3().run(adapter, isInit);
	timer3 = setTimeout(updateInterval3, duration3);
}
	
/*
 * call for updated states in interval_4 (default once per day)
 */
function updateInterval4() {
	// updating values
	const Interval4 = require(__dirname + '/lib/Interval4.js');
	new Interval4().run(adapter, isInit);
	timer4 = setTimeout(updateInterval4, duration4);
}

/**
 * 
 */
class Moma extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'moma',
		});
		adapter = this;
		this.on('ready', this.onReady.bind(this));
		this.on('objectChange', this.onObjectChange.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 * So we do our initializations here and start the recurrent updates via timer events.
	 */
	async onReady() {
		// Initializiation of adapter
		this.log.debug('starting adapter');
		// Reset the connection indicator during startup
		this.setState('info.connection', false, true);
		this.setForeignState(alive, {val: true, ack: true, expire: expiration});
		this.setForeignState(attention, {val: true, ack: true});

		try {
			// create Entries moma.meta.<hostname>.*
			await require(__dirname + '/lib/helper').createMomaMetaEntries(this);
			// create Entries moma.<instanceId>.*
			await require(__dirname + '/lib/helper').createMomaInstanceEntries(this);
			// set the instance in moma.meta.<hostname>.instance
			this.setForeignState(instance, {val: this.namespace, ack: true});
		  
			// with this codeline all states changes inside the adapters namespace moma.<instance> are subscribed
			// not those of moma.meta
			//this.subscribeStates('*');
	
			// read 'static' values on restart for change of machine configuration
			const Once = require(__dirname + '/lib/Once.js');
			await new Once().run(this, true);
		} catch(err) {
			this.log.error('Error on startup: ' + err);
		}

		// start the recurrent updates of values
		// if checked run each interval once and then start it with interval timer
		// start with the longest interval
		if(this.config.i4 && this.config.interval4) {
			duration4 = this.config.interval4*24*60*60*1000;
			await updateInterval4();
		}

		if(this.config.i3 && this.config.interval3) {
			duration3 = this.config.interval3*60*60*1000;
			await updateInterval3();
		}

		if(this.config.i2 && this.config.interval2) {
			duration2 = this.config.interval2*60*1000;
			await updateInterval2();
		}

		if(this.config.i1 && this.config.interval1) {
			duration1 = this.config.interval1*1000;
			await updateInterval1();
		}

		if(this.config.i0 && this.config.interval0) {
			duration0 = this.config.interval0*1000;
			await updateInterval0();
		}

		// init is done
		isInit = false;
		updateIntervalAlive();

		// Set the connection indicator after startup
		this.setState('info.connection', true, true);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.setForeignState(alive, {val: false, ack: true});
			// clean up the timer
			if(timer4) { clearInterval(timer4); timer4 = undefined; }
			if(timer3) { clearInterval(timer3); timer3 = undefined; }
			if(timer2) { clearInterval(timer2); timer2 = undefined; }
			if(timer1) { clearInterval(timer1); timer1 = undefined; }
			if(timer0) { clearInterval(timer0); timer0 = undefined; }
			if(timer) { clearInterval(timer); timer = undefined; }
		} catch (e) {
			this.log.error(e);
		} finally {
			callback();
			this.log.info('cleaned everything up...');
		}
	}

	/**
	 * Is called if a subscribed object changes
	 * @param {string} id
	 * @param {ioBroker.Object | null | undefined} obj
	 */
	onObjectChange(id, obj) {
		if (obj) {
			// The object was changed
			this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
		} else {
			// The object was deleted
			this.log.info(`object ${id} deleted`);
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	/**
	 * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	 * Using this method requires 'common.messagebox' property to be set to true in io-package.json
	 * @param {ioBroker.Message} obj
	 */
	onMessage(obj) {
		if (typeof obj === 'object' && obj.message) {
			// this.log.debug(JSON.stringify(obj));
	 		if (obj.command === 'execute') {
	 			// e.g. send email or pushover or whatever
				this.log.info('send command ' + obj.message);
				if(obj.message == 'doUpdates') {
					const Interval4 = require(__dirname + '/lib/Interval4.js');
					new Interval4().doUpdates(this);
				} else if(obj.message == 'scheduleReboot') {
					const Interval4 = require(__dirname + '/lib/Interval4.js');
					new Interval4().scheduleReboot(this);
				}

	 			// Send response in callback if required
	 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
	 		}
	 	}
	}
}

// @ts-ignore
if (module && module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Moma(options);
} else {
	// otherwise start the instance directly
	new Moma();
}