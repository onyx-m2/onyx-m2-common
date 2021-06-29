import { BitView } from 'bit-buffer'
import DirectTransport from './DirectTransport.js'

// BLE interface
const BLE_SERVICE_NAME = "Onyx M2"
const BLE_SERVICE_UUID = "e9377e45-d4d2-4fdc-9e1c-448d8b4e05d5"
const BLE_CONFIG_CHARACTERISTIC_UUID = "3c1a503d-06bd-4153-874c-c03e4866f19b"
const BLE_RELAY_CHARACTERISTIC_UUID = "8e9e4115-30a8-4ce6-9362-5afec3315d7d"
const BLE_COMMAND_CHARACTERISTIC_UUID = "25b9cc8b-9741-4beb-81fc-a0df9b155f8d"
const BLE_MESSAGE_CHARACTERISTIC_UUID = "7d363f56-9154-4168-8ee8-034a216edfb4"

const log = console

function serializePromises(immediate) {
  let last = Promise.resolve()
  return function (...a) {
    last = last.catch(() => {}).then(() => immediate(...a))
    return last
  }
}

/**
 * Implements a web bluetooth transport that communicates directly with the m2 device.
 * This only works if running in a web browser that is pre-paired with the M2. The
 * protocol is the same as the native transport uses.
 */
export default class WebBluetoothTransport extends DirectTransport {

  /**
   * Construct a web bluetooth transport.
   */
  constructor(dbc) {
    super(dbc)

    // the bluetooth device
    this.device = null

    // the function that writes to the commands characteristic
    this.writeCommandCharacteristic = () => {}
  }

  /**
   * Connect to the bluetooth device referenced in the `ble` config.
   */
  connect(config) {
    this.device = config.ble
    this.device.addEventListener('advertisementreceived', e => this.handleAdvertisement(e))
    this.device.addEventListener('gattserverdisconnected', e => this.handleDisconnect())
    log.debug('Connecting')
    this.reconnect()
  }

  /**
   * Reconnect to a previously configured bluetooth device. This is done by starting to
   * listen to advertisements from the device. If the device in range,
   * handleAdvertisement will trigger and complete the handshake.
   */
  reconnect() {
    // BUG: Running this with Chromium on RPI doesn't work. The callback is never called,
    //      even though the device is in range. The workaround to simply spam the device
    //      with gatt connect requests until it actually connects. This probably uses a
    //      lot more energy. But... using this strategy doesn't work for systems that
    //      implement watching properly (tested on Android and Windows), grrrr.
    // REF: https://www.chromestatus.com/feature/5180688812736512
    //      Note: watchAdvertisements() is not supported in Linux due to limitations of BlueZ.
    const isLinux = navigator.userAgent.includes('X11;')
    if (isLinux) {
      this.connectGatt()
    }
    else {
      log.debug('Watching for advertisement from M2')
      this.advertisements = new AbortController()
      this.device.watchAdvertisements({ signal: this.advertisements.signal })
    }
  }

  handleAdvertisement() {
    log.debug('Got advertisement from M2')
    this.advertisements.abort()
    this.connectGatt()
  }

  handleDisconnect() {
    log.info(`GATT device disconnected, reconnecting in 2s`)
    setTimeout(() => this.reconnect(), 2000)
  }

  async connectGatt() {
    log.debug(`Connecting to GATT server on device ${this.device.name}`)
    try {
      const server = await this.device.gatt.connect()
      log.debug('GATT server connected')

      const service = await server.getPrimaryService(BLE_SERVICE_UUID)
      log.debug('GATT got primary service')

      const messageCharacteristic = await service.getCharacteristic(BLE_MESSAGE_CHARACTERISTIC_UUID)
      messageCharacteristic.addEventListener('characteristicvaluechanged', (event) => this.handleMessage(event))
      log.debug('GATT got message characteristic')

      await messageCharacteristic.startNotifications()
      log.debug('GATT started notification on message characteristic')

      const commandCharacteristic = await service.getCharacteristic(BLE_COMMAND_CHARACTERISTIC_UUID)
      this.writeCommandCharacteristic = serializePromises(v => commandCharacteristic.writeValue(v))
      this.connected = true
      log.debug('GATT got command characteristic')

      this.enableAllSubscribedMessages()
      }
    catch (e) {
      log.error(`Error connecting to M2.\n${e}`)
      this.connected = false
      setTimeout(() => this.reconnect(), 2000)
    }
  }

  /**
   * Send the specified command through the bluetooth interface to the M2. This must be
   * serialized to make sure we don't attempt to write a new value before the previous
   * one has been acknowledged by the gatt server (will give a 'GATT operation already
   * in progress' error).
   */
  sendCommand(command) {
    this.writeCommandCharacteristic(Uint8Array.from(command))
  }

  /**
   * Handle messages by unpacking the data from the bluetooth interface and send to the
   * direct layer for decoding and dispatching.
   */
  handleMessage(event) {
    const data = new Uint8Array(event.target.value.buffer)
    try {
      const bus = data[4]
      const id = data[5] | data[6] << 8
      const len = data[7]
      const bits = new BitView(data.buffer, 8, len)
      this.processMessage(bus, id, bits)
    }
    catch (e) {
      log.error(`Error parsing message data, length: ${data.length}.\n${e}`)
    }
  }
}
