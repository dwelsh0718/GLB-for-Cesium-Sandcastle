/**
 * Add M.js - Simplified Interceptor Addition for Cesium
 * 
 * Reduced version of missim-retro.js that ONLY adds interceptor animations.
 * Features:
 * - Simple toolbar with "Add M" button
 * - Double-click workflow: launch site → target selection
 * - Interceptor animation with boost phase + curved flight
 * - Live speed/Mach labels
 * - Multiple interceptors supported
 * - Interceptors disappear after animation completes (no looping)
 * 
 * Usage in Cesium Sandcastle:
 * const viewer = new Cesium.Viewer('cesiumContainer');
 * // Paste this code below viewer creation
 */

const viewer = new Cesium.Viewer("cesiumContainer", {
  baseLayer: Cesium.ImageryLayer.fromWorldImagery({
    style: Cesium.IonWorldImageryStyle.AERIAL,
  }),
  baseLayerPicker: false,
});

// Simple toolbar
var toolbar = document.createElement('div');
toolbar.style.position = 'absolute';
toolbar.style.top = '10px';
toolbar.style.left = '10px';
toolbar.style.background = 'rgba(42, 42, 42, 0.85)';
toolbar.style.padding = '10px';
toolbar.style.borderRadius = '5px';
toolbar.style.color = 'white';
toolbar.style.zIndex = '1000';

var addBtn = document.createElement('button');
addBtn.textContent = 'Add M';
addBtn.style.marginLeft = '10px';
addBtn.style.padding = '5px 15px';
addBtn.style.backgroundColor = '#007acc';
addBtn.style.color = 'white';
addBtn.style.border = 'none';
addBtn.style.borderRadius = '3px';
addBtn.style.cursor = 'pointer';
toolbar.appendChild(addBtn);

var statusMsg = document.createElement('span');
statusMsg.style.marginLeft = '14px';
statusMsg.style.fontWeight = 'bold';
statusMsg.textContent = 'Click "Add M" to start interceptor workflow.';
toolbar.appendChild(statusMsg);

document.body.appendChild(toolbar);

// State variables
let interceptors = [];
let currentInterceptor = null;
let entityStep = null;
let sceneStartTime = null;
let interceptorCounter = 0;

// Interceptor state factory
function makeInterceptorState() {
  return {
    launch: null,
    target: null,
    rocketEntity: null,
    pathEntity: null,
    labelEntity: null,
    startTime: null,
    endTime: null,
    positions: null,
    times: null,
    launchTime: null,
    arrivalTime: null,
    name: null
  };
}

// Speed label function
function addSpeedLabel(entity, positions, times, color, entityName) {
  function brighten(col) {
    return new Cesium.Color(
      Math.min(col.red * 2, 1),
      Math.min(col.green * 2, 1),
      Math.min(col.blue * 2, 1),
      1.0
    );
  }
  
  let labelEntity = viewer.entities.add({
    position: entity.position,
    label: {
      text: new Cesium.CallbackProperty(function(time) {
        if (!times || times.length < 2) return entityName;
        let idx = times.findIndex(t => Cesium.JulianDate.compare(t, time) >= 0);
        if (idx <= 0) idx = 1;
        if (idx >= times.length) idx = times.length - 1;
        let dt = Cesium.JulianDate.secondsDifference(times[idx], times[idx - 1]);
        let p1 = positions[idx - 1];
        let p2 = positions[idx];
        if (!p1 || !p2 || dt === 0) return entityName;
        let dist = Cesium.Cartesian3.distance(p1, p2);
        let speed_kms = (dist / dt) / 1000;
        let mach = speed_kms * 1000 / 343;
        return `${entityName}\n${speed_kms.toFixed(2)} km/s\nMach ${mach.toFixed(1)}`;
      }, false),
      font: "bold 14px monospace",
      fillColor: brighten(color),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      showBackground: false,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -40),
      scale: 1.0,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      eyeOffset: new Cesium.Cartesian3(0, 0, -8000)
    }
  });
  return labelEntity;
}

// Add M button click handler
addBtn.onclick = function() {
  currentInterceptor = makeInterceptorState();
  entityStep = 0;
  statusMsg.textContent = "Double-click the globe to select the interceptor launch site.";
};

// Double-click handler for launch site selection
viewer.screenSpaceEventHandler.setInputAction(function(click) {
  var position = viewer.scene.pickPosition(click.position);
  if (!Cesium.defined(position)) {
    // Fallback to ellipsoid pick if scene pick fails
    position = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
  }
  if (!Cesium.defined(position)) return;
  
  var carto = Cesium.Cartographic.fromCartesian(position);
  var lon = Cesium.Math.toDegrees(carto.longitude);
  var lat = Cesium.Math.toDegrees(carto.latitude);
  var launchTime = viewer.clock.currentTime.clone();

  if (currentInterceptor && entityStep === 0) {
    // Set launch site
    currentInterceptor.launch = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
    currentInterceptor.launchTime = launchTime;
    entityStep = 1;
    statusMsg.textContent = "Double-click any object or location on the globe to set target.";
    return;
  }
  
  if (currentInterceptor && entityStep === 1) {
    // Set target - can be any point on globe
    currentInterceptor.target = Cesium.Cartesian3.fromDegrees(lon, lat, carto.height || 0);
    currentInterceptor.arrivalTime = viewer.clock.currentTime.clone();
    entityStep = null;
    statusMsg.textContent = "Interceptor target set. Creating animation...";
    
    // Assign interceptor name
    interceptorCounter++;
    currentInterceptor.name = `I${interceptorCounter}`;
    
    // Add some delay for arrival time if same as launch
    let timeDiff = Cesium.JulianDate.secondsDifference(currentInterceptor.arrivalTime, currentInterceptor.launchTime);
    if (timeDiff <= 0) {
      currentInterceptor.arrivalTime = Cesium.JulianDate.addSeconds(currentInterceptor.launchTime, 8, new Cesium.JulianDate());
    }
    
    addInterceptorAnimation(
      currentInterceptor.launch,
      currentInterceptor.target,
      currentInterceptor,
      currentInterceptor.launchTime,
      currentInterceptor.arrivalTime
    );
    
    interceptors.push(currentInterceptor);
    currentInterceptor = null;
    statusMsg.textContent = "Interceptor animation created! Click 'Add M' to add another.";
  }
}, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

// Single click handler for entity targeting
viewer.screenSpaceEventHandler.setInputAction(function(click) {
  if (!currentInterceptor || entityStep !== 1) return;
  
  let pickedObj = viewer.scene.pick(click.position);
  if (!pickedObj || !pickedObj.id) return;

  // Check if clicked entity has a position
  let targetPos = null;
  if (pickedObj.id.position) {
    try {
      targetPos = pickedObj.id.position.getValue(viewer.clock.currentTime);
    } catch (e) {
      // If position evaluation fails, fall back to scene pick
      targetPos = viewer.scene.pickPosition(click.position);
    }
  }

  if (targetPos) {
    currentInterceptor.target = targetPos;
    currentInterceptor.arrivalTime = viewer.clock.currentTime.clone();
    entityStep = null;
    statusMsg.textContent = "Interceptor target set. Creating animation...";
    
    // Assign interceptor name
    interceptorCounter++;
    currentInterceptor.name = `I${interceptorCounter}`;
    
    // Ensure minimum flight time
    let timeDiff = Cesium.JulianDate.secondsDifference(currentInterceptor.arrivalTime, currentInterceptor.launchTime);
    if (timeDiff <= 0) {
      currentInterceptor.arrivalTime = Cesium.JulianDate.addSeconds(currentInterceptor.launchTime, 8, new Cesium.JulianDate());
    }
    
    addInterceptorAnimation(
      currentInterceptor.launch,
      currentInterceptor.target,
      currentInterceptor,
      currentInterceptor.launchTime,
      currentInterceptor.arrivalTime
    );
    
    interceptors.push(currentInterceptor);
    currentInterceptor = null;
    statusMsg.textContent = "Interceptor animation created! Click 'Add M' to add another.";
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// Interceptor animation function
function addInterceptorAnimation(launchPosition, targetPosition, interceptor, interceptorLaunchTime, interceptorArrivalTime) {
  const boostAltitude = 1000;
  const numPoints = 100;
  const totalSeconds = Cesium.JulianDate.secondsDifference(interceptorArrivalTime, interceptorLaunchTime);

  const property = new Cesium.SampledPositionProperty();
  const positions = [];

  const cartoLaunch = Cesium.Cartographic.fromCartesian(launchPosition);
  const cartoTarget = Cesium.Cartographic.fromCartesian(targetPosition);

  const launchLon = Cesium.Math.toDegrees(cartoLaunch.longitude);
  const launchLat = Cesium.Math.toDegrees(cartoLaunch.latitude);
  const targetLon = Cesium.Math.toDegrees(cartoTarget.longitude);
  const targetLat = Cesium.Math.toDegrees(cartoTarget.latitude);

  function interpolateGeo(lonA, latA, lonB, latB, frac) {
    return [
      lonA + (lonB - lonA) * frac,
      latA + (latB - latA) * frac
    ];
  }

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    let pos;
    if (t < 0.2) {
      // Boost phase - vertical rise
      const frac = t / 0.2;
      const altitude = frac * boostAltitude;
      pos = Cesium.Cartesian3.fromDegrees(launchLon, launchLat, altitude);
    } else {
      // Curved portion using quadratic Bezier
      const curveFrac = (t - 0.2) / 0.8;
      const [ctrlLon, ctrlLat] = interpolateGeo(launchLon, launchLat, targetLon, targetLat, 0.5);
      const startBoost = Cesium.Cartesian3.fromDegrees(launchLon, launchLat, boostAltitude);
      const end = Cesium.Cartesian3.fromDegrees(targetLon, targetLat, cartoTarget.height);
      const midAltitude = (boostAltitude + cartoTarget.height) / 2;
      const controlAltitude = Math.min(midAltitude + Math.abs(cartoTarget.height - boostAltitude) / 2, cartoTarget.height);
      const control = Cesium.Cartesian3.fromDegrees(ctrlLon, ctrlLat, controlAltitude);

      const w0 = (1 - curveFrac) * (1 - curveFrac);
      const w1 = 2 * (1 - curveFrac) * curveFrac;
      const w2 = curveFrac * curveFrac;

      pos = new Cesium.Cartesian3(
        w0 * startBoost.x + w1 * control.x + w2 * end.x,
        w0 * startBoost.y + w1 * control.y + w2 * end.y,
        w0 * startBoost.z + w1 * control.z + w2 * end.z
      );
    }
    positions.push(pos);
    const time = Cesium.JulianDate.addSeconds(interceptorLaunchTime, t * totalSeconds, new Cesium.JulianDate());
    property.addSample(time, pos);
  }
  interceptor.positions = positions;
  interceptor.times = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    interceptor.times.push(Cesium.JulianDate.addSeconds(interceptorLaunchTime, t * totalSeconds, new Cesium.JulianDate()));
  }

  // Set entity availability to only exist during animation time window
  const availability = new Cesium.TimeIntervalCollection([
    new Cesium.TimeInterval({
      start: interceptorLaunchTime,
      stop: interceptorArrivalTime
    })
  ]);

  // Path entity
  interceptor.pathEntity = viewer.entities.add({
    availability: availability,
    polyline: {
      positions: positions,
      width: 2,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.4,
        color: Cesium.Color.CYAN,
      }),
    },
    name: "Interceptor Path"
  });

  // --- IMPROVED CONE ORIENTATION AND VISIBILITY ---
  const baseOrientation = new Cesium.VelocityOrientationProperty(property);
  const rotX = Cesium.Math.toRadians(0);
  const rotY = Cesium.Math.toRadians(90);
  const rotZ = Cesium.Math.toRadians(0);
  const rotXMatrix = Cesium.Matrix3.fromRotationX(rotX);
  const rotYMatrix = Cesium.Matrix3.fromRotationY(rotY);
  const rotZMatrix = Cesium.Matrix3.fromRotationZ(rotZ);

  let fixedUserRotation = Cesium.Matrix3.multiply(
    rotZMatrix,
    rotYMatrix,
    new Cesium.Matrix3()
  );
  fixedUserRotation = Cesium.Matrix3.multiply(
    fixedUserRotation,
    rotXMatrix,
    fixedUserRotation
  );

  const fixedOrientation = new Cesium.CallbackProperty(function (time, result) {
    const baseQuaternion = baseOrientation.getValue(time, result);
    if (!baseQuaternion) {
      return undefined;
    }
    const baseMatrix = Cesium.Matrix3.fromQuaternion(baseQuaternion);
    const finalMatrix = Cesium.Matrix3.multiply(
      baseMatrix,
      fixedUserRotation,
      new Cesium.Matrix3()
    );
    return Cesium.Quaternion.fromRotationMatrix(finalMatrix);
  }, false);

  // Interceptor cone with proper visible size and tip-first orientation
  interceptor.rocketEntity = viewer.entities.add({
    availability: availability,
    position: property,
    orientation: fixedOrientation,
    cylinder: {
      length: 25000,         // Increased from 13500 - good visible size
      topRadius: 0.0,
      bottomRadius: 6000,    // Increased from 3600 - good visible size  
      material: Cesium.Color.CYAN.withAlpha(0.9),
      outline: true,
      outlineColor: Cesium.Color.WHITE,
    },
    name: "Interceptor"
  });

  // Speed label
  interceptor.labelEntity = addSpeedLabel(interceptor.rocketEntity, positions, interceptor.times, Cesium.Color.CYAN, interceptor.name);
  // Set label availability to match interceptor
  interceptor.labelEntity.availability = availability;

  // Start animation
  viewer.clock.shouldAnimate = true;
  // Interceptors disappear after animation completes
  viewer.clock.onTick.addEventListener(function() {
    if (viewer.clock.currentTime >= interceptorArrivalTime) {
      viewer.entities.remove(interceptor.pathEntity);
      viewer.entities.remove(interceptor.rocketEntity);
      viewer.entities.remove(interceptor.labelEntity);
    }
  });
}

console.log('Add M - Interceptor Animation System Loaded!');