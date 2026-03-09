# Arduino MQTT SGP40 Project

This project sends SGP40 sensor data to an MQTT broker from the Arduino sketch in `MQTT_homeWifi_SGP40WifiClient/`.

## What `server.js` Needs to Know

If you want a `server.js` program to receive this data, you need these MQTT settings:

- Broker host: `tigoe.net`
- Broker port: `1883`
- Username: `conndev`
- Password: `b4s1l!`
- Topic to subscribe to: `TheMist`

## Message Format

The Arduino publishes JSON messages like this:

```json
{
  "time": 11213,
  "voc": 0,
  "temperature": 25.0,
  "humidity": 50.0
}
```

Field meanings:

- `time`: milliseconds since the Arduino board started
- `voc`: SGP40 VOC index
- `temperature`: temperature used for SGP40 compensation
- `humidity`: humidity used for SGP40 compensation

## Example `server.js`

Install the MQTT package first:

```bash
npm install mqtt
```

Then use this example:

```js
const mqtt = require("mqtt");

const client = mqtt.connect("mqtt://tigoe.net:1883", {
  username: "conndev",
  password: "b4s1l!"
});

client.on("connect", () => {
  console.log("Connected to broker");
  client.subscribe("TheMist", (err) => {
    if (err) {
      console.error("Subscribe failed:", err);
    } else {
      console.log("Subscribed to TheMist");
    }
  });
});

client.on("message", (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log("Topic:", topic);
    console.log("Data:", data);
  } catch (error) {
    console.error("Invalid JSON:", message.toString());
  }
});
```

## Notes

- The Arduino publishes once per second.
- If you change the topic in the Arduino code, `server.js` must subscribe to the new topic.
- If DHT22 reading fails, the sketch keeps sending default compensation values for temperature and humidity.
