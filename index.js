'use strict';

const datejs = require('datejs');
const suncalc = require('suncalc');

module.exports = homebridge => {
  const Characteristic = homebridge.hap.Characteristic;
  const Service = homebridge.hap.Service;

  // Frequency of updates during transition periods.
  const UPDATE_FREQUENCY = 1000;

  class DaylightAccessory {
    constructor(log, config) {
      this.log = log;
      this.service = null;
      this.services = [];

      if (!config.location ||
          !Number.isFinite(config.location.lat) ||
          !Number.isFinite(config.location.lng)) {
        throw new Error('Invalid or missing `location` configuration.');
      }

      this.name = config.name;
      this.location = config.location;
    }

    getAmbientLightLevel(callback) {
      this.log(`Getting ambient light level for ${this.location.lat},${this.location.lng}`)

      const now = new Date();

      const sunToday = suncalc.getTimes(
        new Date.today(),
        this.location.lat,
        this.location.lng
      );
      const sunTomorow = suncalc.getTimes(
        new Date.today().addDays(1),
        this.location.lat,
        this.location.lng
      );

      const times = {
        sunrise: sunToday.sunrise > now ? sunToday.sunrise : sunTomorow.sunrise,
        sunriseEnd: sunToday.sunriseEnd > now ? sunToday.sunriseEnd : sunTomorow.sunriseEnd,
        sunsetStart: sunToday.sunsetStart > now ? sunToday.sunsetStart : sunTomorow.sunsetStart,
        sunset: sunToday.sunset > now ? sunToday.sunset : sunTomorow.sunset
      };

      let lightRatio;
      let nextUpdate;

      if (
        now > times.sunrise &&
        now < times.sunriseEnd
      ) {
        this.log('Sun is rising');
        lightRatio =
          (now - times.sunrise) /
          (times.sunriseEnd - times.sunrise);
        nextUpdate = now + UPDATE_FREQUENCY;
      } else if (
        now > times.sunriseEnd &&
        now < times.sunsetStart
      ) {
        this.log('Sun is up');
        lightRatio = 1;
        nextUpdate = times.sunsetStart;
      } else if (
        now > times.sunsetStart &&
        now < times.sunset
      ) {
        this.log('Sun is setting');
        lightRatio =
          (times.sunset - now) /
          (times.sunset - times.sunsetStart);
        nextUpdate = now + UPDATE_FREQUENCY;
      } else {
        this.log('Sun is set');
        lightRatio = 0;
        nextUpdate = times.sunrise;
      }

      // Range (in lux) from 0.0001 to 100000 in increments of 0.0001.
      const lightLevel = Math.round(1 + lightRatio * 999999999) / 10000;

      this.log(`Calculated ambient light level of ${lightLevel} lux`);

      if (callback) {
        callback(null, lightLevel);
      } else {
        this.service
          .getCharacteristic(Characteristic.CurrentAmbientLightLevel)
          .setValue(lightLevel);

        this.log(`Current time: ${now}, run next update on ${nextUpdate}`);

        setTimeout(this.getAmbientLightLevel.bind(this), nextUpdate - now);
      }
    }

    getStatusActive(callback) {
      this.log(`Getting active state for daylight sensor`)

      callback(null, true);
    }

    getServices() {
      let informationService = new homebridge.hap.Service.AccessoryInformation()
        .setCharacteristic(homebridge.hap.Characteristic.Manufacturer, 'Homebridge')
        .setCharacteristic(homebridge.hap.Characteristic.Model, 'Daylight Sensor')
        .setCharacteristic(homebridge.hap.Characteristic.SerialNumber, 'Daylight Sensor Serial Number');

      this.services.push(informationService);

      let lightSensorService = new Service.LightSensor(this.name);
      lightSensorService
            .getCharacteristic(Characteristic.CurrentAmbientLightLevel)
            .on('get', this.getAmbientLightLevel.bind(this));

      lightSensorService
            .getCharacteristic(Characteristic.StatusActive)
            .on('get', this.getStatusActive.bind(this));

      this.service = lightSensorService;
      this.services.push(lightSensorService);

      this.getAmbientLightLevel();

      return this.services;
    }
  }

  homebridge.registerAccessory('homebridge-daylight', 'Daylight', DaylightAccessory);
};
