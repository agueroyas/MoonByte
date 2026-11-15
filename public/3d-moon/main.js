/**
 * @file
 * Photorealistic 3D Moon Globe (NASA Moon Trek Style)
 * Fixes vertex displacement spikes and separates lunar albedo from crater relief.
 */

var camera, scene, renderer, controls, moon, starField, sunLight, earthLight;
var moonRadius = 80;
var autoRotate = true;
var textureModes = {};
var targetCamPos = null;

init();
animate();

function init() {
    var container = document.getElementById('container');

    // 1. إعداد المشهد والكاميرا
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020204);

    camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 10000);
    camera.position.set(0, 0, moonRadius * 2.45);

    // 2. إعداد مصير الرسوميات (Renderer) بتدرج لوني طبيعي وواضح
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    // 3. التحكم بالكاميرا
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.75;
    controls.maxDistance = moonRadius * 6.5;
    controls.minDistance = moonRadius * 1.12;

    // إيقاف الانتقال الآلي إذا حرك المستخدم الماوس يدوياً
    controls.addEventListener('start', function () {
        targetCamPos = null;
    });

    // 4. نظام الإضاءة الفضائية الواقعي
    // إضاءة محيطية ناعمة تحافظ على وضوح معالم القمر بدون سواد قاتم
    var ambientLight = new THREE.AmbientLight(0xd8dce8, 0.18);
    scene.add(ambientLight);

    // ضوء الشمس الرئيسي
    sunLight = new THREE.DirectionalLight(0xfffcf5, 2.15);
    updateSunPosition(-35);
    scene.add(sunLight);

    // ضوء الأرض المنعكس (Earthshine) لتوضيح الجانب المظلم بنعومة
    earthLight = new THREE.DirectionalLight(0x6880a8, 0.25);
    earthLight.position.set(200, -40, -150);
    scene.add(earthLight);

    // 5. تحميل ومعالجة خرائط القمر
    loadMoonAssets();

    // 6. إنشاء خلفية النجوم
    createStars();

    // 7. تفعيل أدوات الواجهة
    setupUI();

    window.addEventListener('resize', onWindowResize, false);
}

function updateSunPosition(angleDegrees) {
    var rad = angleDegrees * (Math.PI / 180);
    sunLight.position.set(Math.sin(rad) * 400, 35, Math.cos(rad) * 400);
}

function loadMoonAssets() {
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.src = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/textures/planets/moon_1024.jpg";

    img.onload = function () {
        try {
            var maps = processCleanLunarTextures(img);
            textureModes = { natural: maps.naturalMap, telescope: maps.telescopeMap, lola: maps.lolaMap };
            buildMoonMesh(maps.naturalMap, maps.normalMap, maps.roughnessMap);
            hideLoading();
        } catch (error) {
            console.error('Moon texture processing failed:', error);
            useFallbackMoon();
        }
    };

    img.onerror = function () {
        useFallbackMoon();
    };
}

function useFallbackMoon() {
    var canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 512;
    var ctx = canvas.getContext('2d');
    var gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, '#c6c2d2'); gradient.addColorStop(.5, '#817d8e'); gradient.addColorStop(1, '#302e3a');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1024, 512);
    textureModes = { natural: new THREE.CanvasTexture(canvas) };
    buildMoonMesh(textureModes.natural, null, null);
    hideLoading();
    showToast('تعذر تحميل النسيج التفصيلي؛ يعمل العرض الآن بنمط احتياطي.');
}

/**
 * معالجة متقدمة تفصل بين لون السطح (البحار القمرية وأشعة تايكو) وبين الحفر،
 * لتجنب التشوهات الشوكية وإعطاء مظهر القمر الحقيقي الصافي.
 */
function processCleanLunarTextures(sourceImg) {
    var width = 2048;
    var height = 1024;

    var srcCanvas = document.createElement('canvas');
    srcCanvas.width = width;
    srcCanvas.height = height;
    var srcCtx = srcCanvas.getContext('2d');
    srcCtx.imageSmoothingEnabled = true;
    srcCtx.imageSmoothingQuality = 'high';
    srcCtx.drawImage(sourceImg, 0, 0, width, height);

    var srcData = srcCtx.getImageData(0, 0, width, height).data;
    var lum = new Float32Array(width * height);

    for (var i = 0; i < width * height; i++) {
        var idx = i * 4;
        lum[i] = (srcData[idx] * 0.299 + srcData[idx + 1] * 0.587 + srcData[idx + 2] * 0.114) / 255.0;
    }

    // 1. حساب متوسط محلي ناعم (3x3) ومتوسط واسع (9x9) لعزل الحفر عن ألوان السهول
    var smoothLum = new Float32Array(width * height);
    var wideLum = new Float32Array(width * height);

    for (var y = 0; y < height; y++) {
        var yPrev = Math.max(0, y - 1) * width;
        var yCurr = y * width;
        var yNext = Math.min(height - 1, y + 1) * width;

        var yWPrev = Math.max(0, y - 4) * width;
        var yWNext = Math.min(height - 1, y + 4) * width;

        for (var x = 0; x < width; x++) {
            var xPrev = (x - 1 + width) % width;
            var xNext = (x + 1) % width;

            // تنعيم خفيف 3x3
            smoothLum[yCurr + x] = (
                lum[yPrev + xPrev] + lum[yPrev + x] * 2 + lum[yPrev + xNext] +
                lum[yCurr + xPrev] * 2 + lum[yCurr + x] * 4 + lum[yCurr + xNext] * 2 +
                lum[yNext + xPrev] + lum[yNext + x] * 2 + lum[yNext + xNext]
            ) / 16.0;

            // متوسط أوسع لعزل تدرجات الألوان الكبرى (البحار وأشعة الفوهات)
            var xWPrev = (x - 4 + width) % width;
            var xWNext = (x + 4) % width;
            wideLum[yCurr + x] = (
                lum[yWPrev + xWPrev] + lum[yWPrev + x] + lum[yWPrev + xWNext] +
                lum[yCurr + xWPrev]  + lum[yCurr + x]  + lum[yCurr + xWNext] +
                lum[yWNext + xWPrev] + lum[yWNext + x] + lum[yWNext + xWNext]
            ) / 9.0;
        }
    }

    // 2. إنشاء خرائط الألوان (Natural, Telescope, LOLA Topography) + خريطة الخشونة
    var natCanvas = document.createElement('canvas');
    var telCanvas = document.createElement('canvas');
    var lolaCanvas = document.createElement('canvas');
    var roughCanvas = document.createElement('canvas');

    natCanvas.width = telCanvas.width = lolaCanvas.width = roughCanvas.width = width;
    natCanvas.height = telCanvas.height = lolaCanvas.height = roughCanvas.height = height;

    var natCtx = natCanvas.getContext('2d');
    var telCtx = telCanvas.getContext('2d');
    var lolaCtx = lolaCanvas.getContext('2d');
    var roughCtx = roughCanvas.getContext('2d');

    var natImg = natCtx.createImageData(width, height);
    var telImg = telCtx.createImageData(width, height);
    var lolaImg = lolaCtx.createImageData(width, height);
    var roughImg = roughCtx.createImageData(width, height);

    var reliefField = new Float32Array(width * height);

    for (var j = 0; j < width * height; j++) {
        var p = j * 4;
        var base = lum[j];
        var smooth = smoothLum[j];
        var wide = wideLum[j];

        // فلتر Unsharp Mask لإبراز التفاصيل الدقيقة بوضوح تلسكوبي بدون تشويش
        var fineDetail = base - smooth;
        var sharpened = Math.max(0, Math.min(1, base + fineDetail * 1.6));

        // أ. نمط القمر الحقيقي (Natural LROC): تدرج رمادي قمري دافئ وطبيعي
        var natVal = (0.14 + Math.pow(sharpened, 0.92) * 0.82) * 255;
        natImg.data[p]     = Math.min(255, natVal * 1.01);
        natImg.data[p + 1] = Math.min(255, natVal * 0.995);
        natImg.data[p + 2] = Math.min(255, natVal * 0.96);
        natImg.data[p + 3] = 255;

        // ب. نمط التلسكوب عالي التباين (High-Contrast Telescope)
        var telCurve = Math.max(0, Math.min(1, (sharpened - 0.12) * 1.28));
        var telVal = Math.pow(telCurve, 1.08) * 255;
        telImg.data[p]     = telVal;
        telImg.data[p + 1] = telVal;
        telImg.data[p + 2] = Math.min(255, telVal * 1.02);
        telImg.data[p + 3] = 255;

        // ج. نمط خريطة الارتفاعات الملونة (NASA LOLA False-Color Topography)
        var lolaColor = getLolaElevationColor(smooth);
        lolaImg.data[p]     = lolaColor[0];
        lolaImg.data[p + 1] = lolaColor[1];
        lolaImg.data[p + 2] = lolaColor[2];
        lolaImg.data[p + 3] = 255;

        // د. خريطة الخشونة (بحار القمر البازلتية أنعم قليلاً من المرتفعات)
        var roughVal = Math.floor((0.82 + (1.0 - smooth) * 0.16) * 255);
        roughImg.data[p] = roughImg.data[p + 1] = roughImg.data[p + 2] = roughVal;
        roughImg.data[p + 3] = 255;

        // هـ. عزل التضاريس المحلية (Band-Pass): يأخذ تفاصيل الحفر ويتجاهل بياض الأشعة المسطحة
        var localRelief = smooth - wide;
        // كبح القيم المتطرفة حتى لا تتحول أشعة فوهة تايكو إلى جبال شوكية
        var clampedRelief = Math.max(-0.07, Math.min(0.07, localRelief));
        reliefField[j] = smooth * 0.22 + clampedRelief * 0.78;
    }

    natCtx.putImageData(natImg, 0, 0);
    telCtx.putImageData(telImg, 0, 0);
    lolaCtx.putImageData(lolaImg, 0, 0);
    roughCtx.putImageData(roughImg, 0, 0);

    // 3. حساب Normal Map ناعمة ودقيقة للحفر فقط مع تخفيف القطبين لمنع التجمع الشعاعي
    var normCanvas = document.createElement('canvas');
    normCanvas.width = width;
    normCanvas.height = height;
    var normCtx = normCanvas.getContext('2d');
    var normImg = normCtx.createImageData(width, height);
    var normData = normImg.data;

    var normalStrength = 3.2;

    for (var ny = 0; ny < height; ny++) {
        // تخفيف التضاريس تدريجياً عند القطبين الشمالي والجنوبي لمنع خطوط التجمع (Pole Pinching)
        var latSin = Math.sin((ny / (height - 1)) * Math.PI);
        var poleDamping = Math.pow(latSin, 0.75);

        var yUp = Math.max(0, ny - 1) * width;
        var yMid = ny * width;
        var yDown = Math.min(height - 1, ny + 1) * width;

        for (var nx = 0; nx < width; nx++) {
            var xLeft = (nx - 1 + width) % width;
            var xRight = (nx + 1) % width;

            var tl = reliefField[yUp + xLeft];
            var t  = reliefField[yUp + nx];
            var tr = reliefField[yUp + xRight];
            var l  = reliefField[yMid + xLeft];
            var r  = reliefField[yMid + xRight];
            var bl = reliefField[yDown + xLeft];
            var b  = reliefField[yDown + nx];
            var br = reliefField[yDown + xRight];

            var dX = ((tr + 2.0 * r + br) - (tl + 2.0 * l + bl)) * poleDamping;
            var dY = ((bl + 2.0 * b + br) - (tl + 2.0 * t + tr)) * poleDamping;
            var dZ = 1.0 / normalStrength;

            var invLen = 1.0 / Math.sqrt(dX * dX + dY * dY + dZ * dZ);
            var idxOut = (yMid + nx) * 4;

            normData[idxOut]     = (dX * invLen * 0.5 + 0.5) * 255;
            normData[idxOut + 1] = (dY * invLen * 0.5 + 0.5) * 255;
            normData[idxOut + 2] = (dZ * invLen) * 255;
            normData[idxOut + 3] = 255;
        }
    }
    normCtx.putImageData(normImg, 0, 0);

    var maxAniso = renderer.capabilities.getMaxAnisotropy();

    function makeTex(canvas) {
        var tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = maxAniso;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        return tex;
    }

    return {
        naturalMap: makeTex(natCanvas),
        telescopeMap: makeTex(telCanvas),
        lolaMap: makeTex(lolaCanvas),
        normalMap: makeTex(normCanvas),
        roughnessMap: makeTex(roughCanvas)
    };
}

/**
 * تدرج ألوان مسبار ناسا (LOLA Laser Altimeter) للارتفاعات القمرية
 */
function getLolaElevationColor(val) {
    var stops = [
        { pos: 0.0,  rgb: [25, 45, 165] },   // منخفضات عميقة (أزرق)
        { pos: 0.32, rgb: [0, 175, 205] },   // سهول منخفضة (سماوي)
        { pos: 0.52, rgb: [65, 195, 75] },   // مستوى متوسط (أخضر)
        { pos: 0.72, rgb: [245, 215, 40] },  // مرتفعات (أصفر)
        { pos: 0.88, rgb: [230, 65, 30] },   // قمم عالية (أحمر)
        { pos: 1.0,  rgb: [250, 245, 245] }  // أعلى القمم (أبيض)
    ];

    var v = Math.max(0, Math.min(1, (val - 0.12) / 0.78));
    for (var i = 0; i < stops.length - 1; i++) {
        if (v >= stops[i].pos && v <= stops[i + 1].pos) {
            var t = (v - stops[i].pos) / (stops[i + 1].pos - stops[i].pos);
            return [
                Math.floor(stops[i].rgb[0] + (stops[i + 1].rgb[0] - stops[i].rgb[0]) * t),
                Math.floor(stops[i].rgb[1] + (stops[i + 1].rgb[1] - stops[i].rgb[1]) * t),
                Math.floor(stops[i].rgb[2] + (stops[i + 1].rgb[2] - stops[i].rgb[2]) * t)
            ];
        }
    }
    return [250, 245, 245];
}

function buildMoonMesh(colorMap, normalMap, roughnessMap) {
    // كرة عالية الدقة بدون تشويه هندسي (بدون displacementMap شوكي)
    var geometry = new THREE.SphereGeometry(moonRadius, 192, 192);

    var material = new THREE.MeshStandardMaterial({
        map: colorMap,
        normalMap: normalMap,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughnessMap: roughnessMap,
        roughness: 0.96,
        metalness: 0.0
    });

    // تعديل شيدر الإضاءة ليحاكي انعكاس غبار القمر الفيزيائي (Oren-Nayar / Lommel-Seeliger)
    material.onBeforeCompile = function (shader) {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <lights_physical_pars_fragment>',
            `
            #include <lights_physical_pars_fragment>
            `
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `
            // تعزيز الإضاءة عند أطراف القمر المضيئة (Lunar Limb Brightening) مثل القمر الحقيقي
            vec3 viewDir = normalize(vViewPosition);
            float ndotv = max(dot(normal, viewDir), 0.001);
            float limbFactor = mix(1.14, 0.96, pow(ndotv, 0.6));
            gl_FragColor.rgb *= limbFactor;
            #include <dithering_fragment>
            `
        );
    };

    moon = new THREE.Mesh(geometry, material);
    // ضبط زاوية البداية لمواجهة الوجه القريب للقمر (Near Side) كما يُرى من الأرض
    moon.rotation.y = -Math.PI * 0.5;
    scene.add(moon);
}

function createStars() {
    var starVertices = [];
    for (var i = 0; i < 4500; i++) {
        var r = 1800 + Math.random() * 2200;
        var theta = Math.random() * Math.PI * 2;
        var phi = Math.acos(2 * Math.random() - 1);

        starVertices.push(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.sin(phi) * Math.sin(theta),
            r * Math.cos(phi)
        );
    }

    var starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));

    var starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.15,
        transparent: true,
        opacity: 0.65
    });

    starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField);
}

function setupUI() {
    var viewModeSelect = document.getElementById('viewMode');
    var sunAngleInput = document.getElementById('sunAngle');
    var reliefDepthInput = document.getElementById('reliefDepth');
    var autoRotateInput = document.getElementById('autoRotate');
    var landmarkBtns = document.querySelectorAll('.landmark-btn');

    viewModeSelect.addEventListener('change', function (e) {
        if (!moon || !textureModes[e.target.value]) return;
        moon.material.map = textureModes[e.target.value];
        moon.material.needsUpdate = true;
    });

    sunAngleInput.addEventListener('input', function (e) {
        updateSunPosition(parseFloat(e.target.value));
    });

    reliefDepthInput.addEventListener('input', function (e) {
        if (!moon) return;
        var scale = (parseFloat(e.target.value) / 45) * 0.85;
        moon.material.normalScale.set(scale, scale);
    });

    autoRotateInput.addEventListener('change', function (e) {
        autoRotate = e.target.checked;
    });

    // أزرار الانتقال السريع لمعالم القمر
    landmarkBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            if (!moon) return;
            autoRotate = false;
            autoRotateInput.checked = false;
            document.querySelectorAll('.landmark-btn').forEach(function (item) { item.classList.remove('selected'); });
            btn.classList.add('selected');

            var lat = parseFloat(btn.getAttribute('data-lat')) * (Math.PI / 180);
            var lon = parseFloat(btn.getAttribute('data-lon')) * (Math.PI / 180);
            var zoom = parseFloat(btn.getAttribute('data-zoom'));
            updateFeature(btn.getAttribute('data-name') || btn.textContent.trim(), parseFloat(btn.getAttribute('data-lat')), parseFloat(btn.getAttribute('data-lon')));

            // إعادة ضبط دوران القمر لحساب الإحداثيات بدقة
            moon.rotation.y = -Math.PI * 0.5;

            var dist = moonRadius * zoom;
            targetCamPos = new THREE.Vector3(
                dist * Math.cos(lat) * Math.sin(lon),
                dist * Math.sin(lat),
                dist * Math.cos(lat) * Math.cos(lon)
            );
        });
    });

    var resetViewButton = document.getElementById('resetView');
    var resetControlsButton = document.getElementById('resetControls');
    if (resetViewButton) resetViewButton.addEventListener('click', resetView);
    if (resetControlsButton) resetControlsButton.addEventListener('click', resetAllControls);

    sunAngleInput.addEventListener('input', function (e) {
        document.getElementById('sunValue').textContent = parseInt(e.target.value, 10) + '°';
    });
    reliefDepthInput.addEventListener('input', function (e) {
        document.getElementById('reliefValue').textContent = e.target.value + '%';
    });
}

function updateFeature(name, lat, lon) {
    var nameNode = document.getElementById('featureName');
    var coordsNode = document.getElementById('featureCoords');
    var readout = document.getElementById('coordReadout');
    if (nameNode) nameNode.textContent = name;
    if (coordsNode) coordsNode.textContent = Math.abs(lat).toFixed(1) + '° ' + (lat < 0 ? 'S' : 'N') + ' · ' + Math.abs(lon).toFixed(1) + '° ' + (lon < 0 ? 'W' : 'E');
    if (readout) readout.textContent = Math.abs(lat).toFixed(1) + '° ' + (lat < 0 ? 'S' : 'N') + ' / ' + Math.abs(lon).toFixed(1) + '° ' + (lon < 0 ? 'W' : 'E');
}

function resetView() {
    if (!moon || !camera || !controls) return;
    moon.rotation.y = -Math.PI * 0.5;
    targetCamPos = new THREE.Vector3(0, 0, moonRadius * 2.45);
    autoRotate = false;
    var rotateToggle = document.getElementById('autoRotate');
    if (rotateToggle) rotateToggle.checked = false;
    document.querySelectorAll('.landmark-btn').forEach(function (item) { item.classList.toggle('selected', item.getAttribute('data-zoom') === '2.45'); });
    updateFeature('الوجه القريب', 0, 0);
}

function resetAllControls() {
    var viewMode = document.getElementById('viewMode');
    var sunAngle = document.getElementById('sunAngle');
    var relief = document.getElementById('reliefDepth');
    var rotate = document.getElementById('autoRotate');
    if (viewMode) { viewMode.value = 'natural'; if (moon && textureModes.natural) { moon.material.map = textureModes.natural; moon.material.needsUpdate = true; } }
    if (sunAngle) { sunAngle.value = -35; updateSunPosition(-35); document.getElementById('sunValue').textContent = '−35°'; }
    if (relief) { relief.value = 45; if (moon) moon.material.normalScale.set(.85, .85); document.getElementById('reliefValue').textContent = '45%'; }
    if (rotate) { rotate.checked = true; autoRotate = true; }
    resetView();
    if (rotate) { rotate.checked = true; autoRotate = true; }
    showToast('تمت إعادة إعدادات الرصد الافتراضية.');
}

function showToast(message) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(function () { toast.classList.remove('show'); }, 3200);
}

function hideLoading() {
    var loaderEl = document.getElementById('loading');
    if (loaderEl) {
        loaderEl.style.opacity = '0';
        setTimeout(function () {
            loaderEl.style.display = 'none';
        }, 400);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    if (moon && autoRotate) {
        moon.rotation.y += 0.00035;
    }

    // حركة انتقال الكاميرا السلسة عند اختيار معلم قمري
    if (targetCamPos) {
        camera.position.lerp(targetCamPos, 0.07);
        if (camera.position.distanceTo(targetCamPos) < 0.4) {
            targetCamPos = null;
        }
    }

    controls.update();
    renderer.render(scene, camera);
}

