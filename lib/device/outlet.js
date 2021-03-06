/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const fakegato = require('fakegato-history')
const helpers = require('./../helpers')
const util = require('util')
module.exports = class deviceOutlet {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.EveHistoryService = fakegato(platform.api)
    this.inUsePowerThreshold = parseInt(this.platform.config.inUsePowerThreshold)
    this.inUsePowerThreshold = isNaN(this.inUsePowerThreshold)
      ? helpers.defaults.inUsePowerThreshold
      : this.inUsePowerThreshold < 0
        ? helpers.defaults.inUsePowerThreshold
        : this.inUsePowerThreshold
    const self = this
    this.eveCurrentConsumption = function () {
      self.Characteristic.call(this, 'Current Consumption', 'E863F10D-079E-48FF-8F27-9C2605A29F52')
      this.setProps({
        format: self.Characteristic.Formats.FLOAT,
        unit: 'W',
        perms: [self.Characteristic.Perms.READ, self.Characteristic.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.eveTotalConsumption = function () {
      self.Characteristic.call(this, 'Total Consumption', 'E863F10C-079E-48FF-8F27-9C2605A29F52')
      this.setProps({
        format: self.Characteristic.Formats.FLOAT,
        unit: 'kWh',
        perms: [self.Characteristic.Perms.READ, self.Characteristic.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.eveVoltage = function () {
      self.Characteristic.call(this, 'Voltage', 'E863F10A-079E-48FF-8F27-9C2605A29F52')
      this.setProps({
        format: self.Characteristic.Formats.FLOAT,
        unit: 'V',
        perms: [self.Characteristic.Perms.READ, self.Characteristic.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.eveElectricCurrent = function () {
      self.Characteristic.call(this, 'Electric Current', 'E863F126-079E-48FF-8F27-9C2605A29F52')
      this.setProps({
        format: self.Characteristic.Formats.FLOAT,
        unit: 'A',
        perms: [self.Characteristic.Perms.READ, self.Characteristic.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.eveResetTotal = function () {
      self.Characteristic.call(this, 'Reset Total', 'E863F112-079E-48FF-8F27-9C2605A29F52')
      this.setProps({
        format: self.Characteristic.Formats.UINT32,
        perms: [self.Characteristic.Perms.READ, self.Characteristic.Perms.NOTIFY, self.Characteristic.Perms.WRITE]
      })
      this.value = this.getDefaultValue()
    }
    util.inherits(this.eveCurrentConsumption, this.Characteristic)
    util.inherits(this.eveTotalConsumption, this.Characteristic)
    util.inherits(this.eveVoltage, this.Characteristic)
    util.inherits(this.eveElectricCurrent, this.Characteristic)
    util.inherits(this.eveResetTotal, this.Characteristic)
    this.eveCurrentConsumption.UUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52'
    this.eveTotalConsumption.UUID = 'E863F10C-079E-48FF-8F27-9C2605A29F52'
    this.eveVoltage.UUID = 'E863F10A-079E-48FF-8F27-9C2605A29F52'
    this.eveElectricCurrent.UUID = 'E863F126-079E-48FF-8F27-9C2605A29F52'
    this.eveResetTotal.UUID = 'E863F112-079E-48FF-8F27-9C2605A29F52'
    if (accessory.getService(this.Service.Switch)) {
      accessory.removeService(accessory.getService(this.Service.Switch))
    }
    let outletService
    if (!(outletService = accessory.getService(this.Service.Outlet))) {
      accessory.addService(this.Service.Outlet)
      outletService = accessory.getService(this.Service.Outlet)
      outletService.addCharacteristic(this.eveVoltage)
      outletService.addCharacteristic(this.eveCurrentConsumption)
      outletService.addCharacteristic(this.eveElectricCurrent)
      outletService.addCharacteristic(this.eveTotalConsumption)
      outletService.addCharacteristic(this.eveResetTotal)
    }
    outletService
      .getCharacteristic(this.Characteristic.On)
      .on('set', (value, callback) => this.internalUpdate(value, callback))
    accessory.log = this.platform.log
    accessory.eveLogger = new this.EveHistoryService('energy', accessory, {
      storage: 'fs',
      minutes: 5,
      path: this.platform.eveLogPath
    })
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    callback()
    try {
      const params = { switch: value ? 'on' : 'off' }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      const outletService = this.accessory.getService(this.Service.Outlet)
      if (helpers.hasProperty(params, 'switch')) {
        outletService.updateCharacteristic(this.Characteristic.On, params.switch === 'on')
        if (!this.accessory.context.powerReadings) {
          outletService.updateCharacteristic(this.Characteristic.OutletInUse, params.switch === 'on')
        }
      }
      if (helpers.hasProperty(params, 'power')) {
        this.accessory.context.powerReadings = true
        outletService.updateCharacteristic(this.Characteristic.OutletInUse, parseFloat(params.power) > this.inUsePowerThreshold)
        outletService.updateCharacteristic(this.eveCurrentConsumption, parseFloat(params.power))
        const isOn = this.accessory.getService(this.Service.Outlet).getCharacteristic(this.Characteristic.On).value
        this.accessory.eveLogger.addEntry({
          time: Math.round(new Date().valueOf() / 1000),
          power: isOn ? parseFloat(params.power) : 0
        })
      }
      if (helpers.hasProperty(params, 'voltage')) {
        outletService.updateCharacteristic(this.eveVoltage, parseFloat(params.voltage))
      }
      if (helpers.hasProperty(params, 'current')) {
        outletService.updateCharacteristic(this.eveElectricCurrent, parseFloat(params.current))
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
