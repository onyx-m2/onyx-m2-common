import React, { createContext, useContext, useEffect, useState } from 'react'

export const ConsumptionContext = createContext()

/**
 * Context provider that tracks consumption gives access to `subscribe` and `unsubscribe`
 * functions for hooking into realtime consumption updates. Requires SignalContext to
 * be up the tree somewhere.
 *
 * @param {*} props
 */
export function ConsumptionProvider(props) {
  const { children } = props

  const [ lifetimeConsumption, setLifetimeConsumption ] = useState(-1)
  const [ tripStartValues, setTripStartValues ] = useState(null)
  const [ tripConsumption, setTripConsumption ] = useState(-1)

  const odometer = useSignalState('DI_odometer', -1)
  const regenTotal = useSignalState('BMS_kwhRegenChargeTotal', -1)
  const driveTotal = useSignalState('BMS_kwhDriveDischargeTotal', -1)

  if (odometer == -1 || regenTotal == -1 || driveTotal == -1) {
    return
  }

  if (tripStartValues == null) {
    setTripStartValues({odometer, regenTotal, driveTotal})
  }

  setLifetimeConsumption((driveTotal - regenTotal) / odometer)
  set

  var odometerStart, chargeStart, dischargeStart, timeStart

  var tripStarted = false
  setInterval(() => {
    const odometer = diOdometer.value
    const charge = bmsCharge.value
    const discharge = bmsDischarge.value
    if (odometer === undefined || charge === undefined || discharge === undefined) {
      return
    }
    if (!tripStarted) {
      tripStarted = true
      odometerStart = odometer
      chargeStart = charge
      dischargeStart = discharge
      timeStart = Date.now()
    }
    const tripDistance = odometer - odometerStart
    const tripMillis = (Date.now() - timeStart)
    const tripCharge = charge - chargeStart
    const tripDischarge = discharge - dischargeStart
    const tripEnergy = tripDischarge - tripCharge
    $('#tripDistance').text(formatVal(tripDistance))
    if (tripMillis > 0) {
      $('#tripSpeed').text(formatVal(tripDistance * 3600000 / tripMillis))
    }
    $('#tripEnergy').text(formatVal(tripEnergy))
    if (tripDistance > 0.01) {
      $('#tripConsumption').text(formatVal(tripEnergy * 1000 / tripDistance))
    }
    if (tripDischarge > 0) {
      $('#tripRegen').text(formatVal(tripCharge * 100 / tripDischarge))
    }
  }, 250)


  if (!listeners) {
    throw new Error('M2Provider is missing in render tree')
  }

  const allSignalsListeners = {}

  function subscribe(mnemonic, handler) {
    let signalListeners = allSignalsListeners[mnemonic]
    if (!signalListeners) {
      signalListeners = allSignalsListeners[mnemonic] = []
    }
    if (signalListeners.length === 0) {
      send('subscribe', [mnemonic])
    }
    signalListeners.push(handler)
  }

  function unsubscribe(mnemonic, handler) {
    const signalListeners = allSignalsListeners[mnemonic]
    if (signalListeners) {
      const index = signalListeners.indexOf(handler)
      if (index !== -1) {
        signalListeners.splice(index, 1)
      }
      if (signalListeners.length === 0) {
        send('unsubscribe', [mnemonic])
        delete allSignalsListeners[mnemonic]
      }
    }
  }

  // handle ingress signals by dispatching them to the listeners
  useEffect(() => {
    function handleSignal(event) {
      event.detail.forEach(([ mnemonic, value ]) => {
        for (let i in allSignalsListeners[mnemonic]) {
          const handler = allSignalsListeners[mnemonic][i]
          handler(value)
        }
      })
    }
    listeners.addEventListener('signal', handleSignal)
    return () => listeners.removeEventListener('signal', handleSignal)
  }, [dbc])

  // handle reconnects by re-subscribing to the signals we require
  useEffect(() => {
    function handleHello() {
      const signals = Object.keys(allSignalsListeners)
      send('subscribe', signals)
    }
    listeners.addEventListener('hello', handleHello)

    return () => listeners.removeEventListener('hello', handleHello)
  }, [dbc])

  return (
    <SignalContext.Provider value={{ subscribe, unsubscribe }}>
      {children}
    </SignalContext.Provider>
  )
}

/**
 * State hook that provides the realtime value of the specified signal. Requires
 * `SignalProvider` to be present in the render tree.
 * @param {String} mnemonic Mnemonic of the signal to subscribe to
 * @param {*} initialValue Initial value to return while the signal has no value
 */
export function useSignalState(mnemonic, initialValue) {
  const { subscribe, unsubscribe } = useContext(SignalContext)
  const [ value, setValue ] = useState(initialValue)
  useEffect(() => {
    function handleSignal(newValue) {
      setValue(newValue)
    }
    subscribe(mnemonic, handleSignal)
    return () => unsubscribe(mnemonic, handleSignal)
  }, [mnemonic])
  return value
}

export function useSignalDisplay(mnemonic, decimals) {
  decimals = decimals === undefined ? 2 : decimals

  const { dbc } = useContext(M2)
  const signalValue = useSignalState(mnemonic, '--')

  let value = signalValue
  if (typeof(value) === 'number') {
    const factor = Math.pow(10, decimals)
    value = Math.round(value * factor) / factor
  }

  const definition = dbc.getSignal(mnemonic)
  let units = 'N/A'
  let name = mnemonic
  if (definition) {
    name = definition.name
    units = definition.units
    if (definition.values) {
      const definedValue = definition.values[value]
      if (definedValue) {
        units = definedValue.replace(/_/g, ' ')
      }
    }
  }
  return { name, value, units }
}

export function useNamedValuesSignalState(mnemonic, initialValue) {
  const { dbc } = useContext(M2)
  const definition = dbc.getSignal(mnemonic)
  const state = useSignalState(mnemonic, definition.namedValues[initialValue])
  return [ state, definition.namedValues ]
}
