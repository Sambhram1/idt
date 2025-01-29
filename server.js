const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const mqtt = require('mqtt');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ================== MongoDB Setup ================== //
mongoose.connect('mongodb+srv://sambhram0803:DV35oAZXjZQGZ9YX@cluster10.mflet.mongodb.net/?retryWrites=true&w=majority&appName=Cluster10', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const CropSchema = new mongoose.Schema({
  name: String,
  sowDate: Date,
  harvestDate: Date,
});

const MoistureSchema = new mongoose.Schema({
  timestamp: Date,
  value: Number,
});

const Crop = mongoose.model('Crop', CropSchema);
const Moisture = mongoose.model('Moisture', MoistureSchema);

// ================== MQTT Sensor Simulation ================== //
const client = mqtt.connect('mqtt://test.mosquitto.org');
client.on('connect', () => {
  console.log('Connected to MQTT Broker');
  setInterval(() => {
    const moisture = Math.random() * 100;
    client.publish('smartfarm/moisture', moisture.toString());
  }, 5000);
});

client.on('message', async (topic, message) => {
  if (topic === 'smartfarm/moisture') {
    const moistureData = new Moisture({ timestamp: new Date(), value: parseFloat(message) });
    await moistureData.save();
  }
});

client.subscribe('smartfarm/moisture');

// ================== Express API Routes ================== //
app.post('/api/crops', async (req, res) => {
  try {
    const crop = new Crop(req.body);
    await crop.save();
    res.status(201).json(crop);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/crops', async (req, res) => {
  try {
    const crops = await Crop.find();
    res.json(crops);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/moisture', async (req, res) => {
  try {
    const data = await Moisture.find().sort({ timestamp: -1 }).limit(10);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================== Frontend (React) ================== //
app.get('/', (req, res) => {
    res.redirect('/index.html');
  });
  

app.get('/index.html', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Smart Farming</title>
      <script src="https://unpkg.com/react@17/umd/react.development.js"></script>
      <script src="https://unpkg.com/react-dom@17/umd/react-dom.development.js"></script>
      <script src="https://unpkg.com/babel-standalone@6/babel.min.js"></script>
      <script src="https://unpkg.com/axios/dist/axios.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body>
      <div id="root"></div>
      <script type="text/babel">
        function App() {
          const [crops, setCrops] = React.useState([]);
          const [moistureData, setMoistureData] = React.useState([]);
          const [formData, setFormData] = React.useState({
            name: '',
            sowDate: '',
            harvestDate: ''
          });

          React.useEffect(() => {
            axios.get('/api/crops')
              .then(res => setCrops(res.data))
              .catch(err => console.error(err));

            axios.get('/api/moisture')
              .then(res => setMoistureData(res.data))
              .catch(err => console.error(err));
          }, []);

          React.useEffect(() => {
            if (moistureData.length) {
              const ctx = document.getElementById('moistureChart').getContext('2d');
              new Chart(ctx, {
                type: 'line',
                data: {
                  labels: moistureData.map(d => new Date(d.timestamp).toLocaleTimeString()),
                  datasets: [{
                    label: 'Soil Moisture (%)',
                    data: moistureData.map(d => d.value),
                    borderColor: 'green',
                    fill: false
                  }]
                }
              });
            }
          }, [moistureData]);

          const handleSubmit = (e) => {
            e.preventDefault();
            axios.post('/api/crops', formData)
              .then(() => {
                setFormData({ name: '', sowDate: '', harvestDate: '' });
                return axios.get('/api/crops');
              })
              .then(res => setCrops(res.data));
          };

          return (
            <div>
              <h1>🌾 Smart Farming Dashboard</h1>
              
              {/* Add Crop Form */}
              <form onSubmit={handleSubmit}>
                <input type="text" placeholder="Crop Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                <input type="date" value={formData.sowDate} onChange={e => setFormData({...formData, sowDate: e.target.value})} />
                <input type="date" value={formData.harvestDate} onChange={e => setFormData({...formData, harvestDate: e.target.value})} />
                <button type="submit">Add Crop</button>
              </form>

              {/* Crops List */}
              <h2>Your Crops:</h2>
              <ul>
                {crops.map(crop => (
                  <li key={crop._id}>
                    <strong>{crop.name}</strong><br />
                    Sown: {new Date(crop.sowDate).toLocaleDateString()}<br />
                    Harvest: {crop.harvestDate ? new Date(crop.harvestDate).toLocaleDateString() : 'Not set'}
                  </li>
                ))}
              </ul>

              {/* Moisture Chart */}
              <h2>Soil Moisture Levels</h2>
              <canvas id="moistureChart" width="400" height="200"></canvas>
            </div>
          );
        }

        ReactDOM.render(<App />, document.getElementById('root'));
      </script>
    </body>
    </html>
  `);
});

// ================== Start Server ================== //
app.listen(5000, () => {
  console.log('Server running on http://localhost:5000');
});
