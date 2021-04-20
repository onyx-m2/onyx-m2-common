# Onyx M2 Common Library

This is part of the [Onyx M2 Project](https://github.com/onyx-m2), which enables
read-only real-time access to the Tesla Model 3/Y CAN bus data, including the
ability to run apps on the car's main screen through its built in web browser.

This library exposes functionality meant to be used on both the server and various
clients. The intent is these classes have minimal dependencies, and work in a
Webpack and Nodejs world.

The exported classes are
- [DBC](#DBC)
- [M2](#M2)
- [Transports](#Transports)

# Installation

The library is available on NPM, so installation is simply:
```
  npm i onyx-m2-common
```

# DBC

The DBC class allows loading and runtime navigation of DBC files. The constructor
assumes the file has already been loaded, and contains the raw contents of the DBC
file.

```js
  const dbc = new DBC('./tesla_model3.dbc')
```

The class manages categories, messages and signals, and these can be used in lookup
functions.

### Category

A category is a simply way to group related messages. In general these will correspond
to specific controllers in the car, or related functionality. A category has `slug` and
`name` fields. For example:

```js
{
  slug: 'park',
  name: 'Park assist system'
}
```

The following functions are offered for navigating message categories.

| Function | Description |
| --- | --- |
| getCategories() | Get all the categories |
| getFirstCategory() | Get the first category |
| getCategory(`slug`) | Get the category that matches the specified `slug` |
| getFirstCategoryMessage(`slug`) | Get the first message of the category that matches the specified `slug` |
| getCategoryMessages(`slug`) | Get the messages that match the category of the specified `slug` |

### Messages

A message corresponds a single CAN message, which typically contains multiple signals.
Messages have a unique `id` and `mnemonic`, are read from a specific `bus` and have a
`length`. They also contain signals, which may be muliplexed (see Vector's DBC spec for
an explanation). In general, signals should be queried directly to avoid having to deal
with the various way signals can be contained in a message. Here is an example of the
door indicator message:

```js
{
    {
      "id": 258,
      "mnemonic": "VCLEFT_doorStatus",
      "category": "vcleft",
      "bus": 0,
      "slug": "door-status",
      "name": "Door status",
      "length": 8,
      "signals": [...]
}
```
The following functions are offered for finding and navigating messages.

| Function | Description |
| --- | --- |
| getMessage(`mnemonic`) | Get the message that matches the specified `mnemonic` |
| getCategoryMessages(`slug`) | Get the first message of the category that matches the specified `slug` |
| getSignalMessage(`mnemonic`) | Reverse lookup of a message using the `mnemonic` of a signal that belongs to that message |

### Signals

A signal is a useful piece of information that has been decoded from a message. This
is what most applications are interested in. Signals have a unique `mnemonic` that
should be used to refer to them, and contain the information necessary to decode their
values (use `decodeSignal()` for this). Additionally, signals may have `units` and
`values`, the latter being named values similar to enumerations. Here's an example
of the signal that indicates whether the driver's door is currently open:

```js
{
  "mnemonic": "VCLEFT_frontLatchStatus",
  "slug": "front-latch-status",
  "name": "Front latch status",
  "start": 0,
  "length": 4,
  "signed": false,
  "scale": 1,
  "offset": 0,
  "units": "",
  "values": {
    "0": "SNA",
    "1": "OPENED",
    "2": "CLOSED",
    "3": "CLOSING",
    "4": "OPENING",
    "5": "AJAR",
    "6": "TIMEOUT",
    "7": "DEFAULT",
    "8": "FAULT"
  },
  "namedValues": {
    "SNA": 0,
    "OPENED": 1,
    "CLOSED": 2,
    "CLOSING": 3,
    "OPENING": 4,
    "AJAR": 5,
    "TIMEOUT": 6,
    "DEFAULT": 7,
    "FAULT": 8
  }
}
```

The following functions are offered for finding and navigating signals.

| Function | Description |
| --- | --- |
| getSignal(`mnemonic`) | Get the signal that matches the specified `mnemonic` |
| getMessageSignals(`mnemonic`) | Get all the signals of the message that matches the specified `mnemonic` |
| getSignalNamedValue(`mnemonic`, `name`) | Get the signal value that matches the specified `mnemonic` and `name` |
| decodeSignal(`bitView`, `signal`) | Get the signal's value currently held in the `bitView` |

### Example

Here's a longer example showing how you might use the class to log the driver's door
status.

```js
  // This will output OPENED, CLOSED, or another state
  const dbc = new DBC('./tesla_model3.dbc')
  const signal = dbc.getSignal('VCLEFT_frontLatchStatus')
  const value = dbc.decodeSignal(data, signal)
  console.log(`The driver's door is ${signal.values[value]}`)
```

See [DBC.js](./src/DBC.js) for additional details.

# M2

The M2 class exposes the low level protocol implemented by the M2 device. See
the [onyx-m2-firmware](https://github.com/johnmccalla/tesla-onyx-m2-firmware) repo
for details on this protocol.

**NOTE: This is currently only used by the client code, but a refactor is desired
        to make it work for the server too. Some concepts need adjustment though.**

See [M2.js](./src/M2.js) for additional details.

# Transports

The transport abstraction is used to communicate between components of the project
(m2, server, clients, etc). It exposes a pausable event stream. Transports are further
categorizes as 'direct' or not. A direct transport is directly connected to the M2
device.

A transport implements the following functions:

| Function | Description |
| --- | --- |
| connect(`config`) | Connect the transport, passing in an implementation specific `config` |
| addEventListener(`event`, `listener`) | Listen for the specified `event` and notify caller by invoking `listener` |
| removeEventListener(`event`, `listener`) | Get the signal value that matches the specified mnemonic and name |
| reconnect() | Reconnect the transport, typically used by stale connection detection functions |
| send(`event`, `data`) | Send an event to the M2  |
| pause() | Pause a transport, holding all events until resume() is called |
| resume() | Resume a paused transport, and drain the events that accumulated while the transport was paused |
| dispatchEvent(`event`, `data`) | Dispatch the specified m2 event to listeners, queuing the event if the transport is currently paused |

The events sent and received by transports correspond to those documented in the
[Client Interface](https://github.com/onyx-m2/onyx-m2-server/blob/master/README.md#client-interface)
of the server's documentation.

There are currently 3 transport implementations.

  1. `NativeTransport`: uses native bindings to connect to the M2 directly. This is
     currently limited to app running in mobile app, like the instrument cluster.
  1. `WebSocketTransport`: use a web socket to communicate with the M2 server to
     relay commands and messages to and from the M2 device. This works well for apps
     that run on the Tesla Model 3 main screen.
  1. `WebBluetoothTransport`: use the experimental Web Bluetooth protocol to connect
     directly to the M2 device. This works very well for apps running on custom hardware,
     like on a Raspberry Pi, or from a laptop or mobile phone, all without requiring
     any custom software be installed.

See [Transport.js](./src/transports/Transport.js) and subclasses for additional details.

**NOTE: This is currently only used by the client code, but a refactor is desired
        to make it work for the server too. Some concepts need adjustment though.**
