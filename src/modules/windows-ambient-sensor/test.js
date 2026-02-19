// Simple test to check if module loads
console.log('Loading module...');

try {
    const ambientSensor = require('./index.js');
    console.log('Module loaded successfully!');
    console.log('Available functions:', Object.keys(ambientSensor));
    console.log('Attempting to call getAmbientLightSensors');
    console.time('light sensor')
    const sensors = ambientSensor.getAmbientLightSensors();
    console.timeEnd('light sensor')
    console.log('sensors:', sensors);
    console.log('getLuxValue: ', ambientSensor.getLuxValue());
    for (const sensor of sensors) {
        console.log(`getLuxValue ${sensor.id}: `, ambientSensor.getLuxValue(sensor.id));
    }
    
} catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
}

console.log('Test complete.');
