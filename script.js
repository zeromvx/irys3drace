 // Game variables
let scene, camera, renderer, car, obstacles = [], banners = [], clouds = [], trees = [];
let gameActive = false;
let paused = false;
let score = 0;
let bestScore = localStorage.getItem('bestRacingScore') || 0;
let roadSegments = [];
let coins = [];
let grassSegments = [];
let roadWidth = 20;
let grassWidth = 100;
let segmentLength = 50;
let segmentsCount = 20;
let carSpeed = 0.5;
let carTurnSpeed = 0.08;
let currentCarModel = 'default';
let clock = new THREE.Clock();
let lastObstacleTime = 0;
let obstacleSpawnDistance = 500; // Increased for distant spawning
let obstacleFrequency = 0.08;
let turboLevel = 100;
let isTurboActive = false;
let turboSpeedMultiplier = 2;
let turboConsumptionRate = 20;
let turboRechargeRate = 10;
let turboFlame = null;
let flameMixer = null;

// Texture loader for obstacles, banners, and clouds
const textureLoader = new THREE.TextureLoader();
const modelLoader = new THREE.GLTFLoader();
// const obstacleTexture = textureLoader.load('./assets/images/irys.png');
// const bannerTextures = [
//     textureLoader.load('./assets/images/banner1.webp'),
//     textureLoader.load('./assets/images/banner2.webp'),
//     textureLoader.load('./assets/images/banner3.webp')
// ];
// const cloudTexture = textureLoader.load('./assets/images/cloud.png');

// let coinModelScene = null;

modelLoader.load('./assets/coin/scene.gltf', (gltf) => {
    coinModelScene = gltf.scene;
}, undefined, (err) => {
    console.error('Error loading coin model:', err);
});

// DOM elements
const menuElement = document.querySelector('.menu');
const pauseMenuElement = document.querySelector('.pause-menu');
const carSelectionElement = document.querySelector('.car-selection');
const scoreElement = document.querySelector('.score');
const bestScoreElement = document.querySelector('.best-score');
const startBtn = document.querySelector('.start-btn');
const resumeBtn = document.querySelector('.resume-btn');
const quitBtn = document.querySelector('.quit-btn');
const carSelectBtn = document.querySelector('.car-select-btn');
const backToMenuBtn = document.querySelector('.back-to-menu-btn');
const selectCarBtns = document.querySelectorAll('.select-car-btn');
const btnLeft = document.querySelector('.btn-left');
const btnRight = document.querySelector('.btn-right');
const btnUp = document.querySelector('.btn-up');

let obstacleTexture;
let cloudTexture;
let bannerTextures = [];
let coinModelScene = null;

// Object Pool for coins
const coinPool = [];
let treePool = [];
let treePrototype = null;

async function preloadAssets() {
    const textureLoader = new THREE.TextureLoader();
    const modelLoader = new THREE.GLTFLoader();

    const loadTexture = (url) => new Promise((resolve, reject) =>
        textureLoader.load(url, resolve, undefined, reject)
    );
    const loadModel = (url) => new Promise((resolve, reject) =>
        modelLoader.load(url, resolve, undefined, reject)
    );

    const [obstacleTex, cloudTex, ...bannerTexArr] = await Promise.all([
        loadTexture('./assets/images/irys.png'),
        loadTexture('./assets/images/cloud.png'),
        loadTexture('./assets/images/banner1.webp'),
        loadTexture('./assets/images/banner2.webp'),
        loadTexture('./assets/images/banner3.webp')
    ]);

    const coinModel = await loadModel('./assets/coin/scene.gltf');

    // Tree prototype creation
    const tree = new THREE.Group();
    const scale = 1.0;
    const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.5, 3, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 1.5;
    tree.add(trunk);

    const foliageGeometry = new THREE.SphereGeometry(2, 12, 12);
    const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
    const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
    foliage.position.y = 3.5;
    tree.add(foliage);

    treePrototype = tree;

    return {
        obstacleTex,
        cloudTex,
        bannerTexArr,
        coinModel: coinModel.scene
    };
}

async function init() {
    const assets = await preloadAssets();
    obstacleTexture = assets.obstacleTex;
    cloudTexture = assets.cloudTex;
    bannerTextures = assets.bannerTexArr;
    coinModelScene = assets.coinModel;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000); 
    camera.position.set(0, 10, -15);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    bestScoreElement.textContent = `Best: ${bestScore}`;

    for (let i = 0; i < 20; i++) {
        createCloud();
    }

    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);

    startBtn.addEventListener('click', startGame);
    resumeBtn.addEventListener('click', resumeGame);
    quitBtn.addEventListener('click', quitToMenu);
    carSelectBtn.addEventListener('click', showCarSelection);
    backToMenuBtn.addEventListener('click', hideCarSelection);

    selectCarBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentCarModel = btn.parentElement.getAttribute('data-car');
            hideCarSelection();
        });
    });

    animate();
}

init();

function getCoinFromPool() {
    if (!coinModelScene) return null;

    if (coinPool.length > 0) {
        return coinPool.pop();
    }

    const coin = coinModelScene.clone(true);
    coin.scale.set(0.2, 0.2, 0.2);
    return coin;
}

function releaseCoin(coin) {
    coinPool.push(coin);
}

function generateCoin(zBase) {
    const zPos = zBase + 10 + Math.random() * 10;
    const xPos = (Math.random() - 0.5) * (roadWidth - 4);

    const coin = getCoinFromPool();
    if (!coin) return;

    coin.position.set(xPos, 0.1, zPos);
    coin.visible = true;
    scene.add(coin);

    coins.push({ mesh: coin, collected: false });
}

function createCloud() {
    const cloudMaterial = new THREE.SpriteMaterial({
        map: cloudTexture,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
    });
    const cloud = new THREE.Sprite(cloudMaterial);
    const scale = 10 + Math.random() * 20; 
    cloud.scale.set(scale, scale, 1);
    
    // Position clouds far ahead
    cloud.position.set(
        (Math.random() - 0.5) * 400, 
        20 + Math.random() * 20,  
        car ? car.position.z + 500 + Math.random() * 1000 : 500 + Math.random() * 1000 
    );
    
    scene.add(cloud);
    clouds.push({
        mesh: cloud,
        z: cloud.position.z,
        driftSpeed: 0.02 + Math.random() * 0.03 // Random drift speed
    });
}

function getTreeFromPool() {
    if (treePool.length > 0) return treePool.pop();

    if (!treePrototype) return null;

    const treeClone = treePrototype.clone(true);
    return treeClone;
}

function releaseTree(tree) {
    treePool.push(tree);
}

function createTree(segment) {
    const tree = getTreeFromPool();
    if (!tree) return;

    const scale = 0.8 + Math.random() * 0.4;
    tree.scale.set(scale, scale, scale);

    const side = Math.random() < 0.5 ? -1 : 1;
    const xOffset = roadWidth / 2 + 2 + Math.random() * (grassWidth / 2 - 10);
    tree.position.set(
        segment.x + side * xOffset,
        0,
        segment.z + Math.random() * segmentLength
    );

    tree.rotation.y = Math.random() * Math.PI * 2;

    scene.add(tree);
    trees.push({
        mesh: tree,
        z: tree.position.z
    });
}

function startGame() {
    gameActive = true;
    paused = false;
    score = 0;
    turboLevel = 100;
    obstacleFrequency = 0.08;
    scoreElement.textContent = `Score: ${score}`;
    
    clearRoadAndObstacles();
    createInitialRoad();
    createCar();
    
    menuElement.style.display = 'none';
}

function createInitialRoad() {
    roadSegments = [];
    grassSegments = [];
    
    for (let i = 0; i < segmentsCount; i++) {
        const segment = {
            x: 0,
            z: i * segmentLength,
            curve: 0,
            start: i * segmentLength,
            end: (i + 1) * segmentLength
        };
        
        roadSegments.push(segment);
        grassSegments.push(segment);
        createRoadSegment(segment);
        createGrassSegment(segment);
    }
}

function createRoadSegment(segment) {
    const geometry = new THREE.PlaneGeometry(roadWidth, segmentLength);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x333333,
        side: THREE.FrontSide
    });
    const roadPiece = new THREE.Mesh(geometry, material);
    roadPiece.position.x = segment.x;
    roadPiece.position.z = segment.z + segmentLength / 2;
    roadPiece.position.y = 0.01;
    roadPiece.rotation.x = -Math.PI / 2;
    
    // Left line
    const leftLineGeometry = new THREE.PlaneGeometry(0.2, segmentLength);
    const leftLineMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffffff,
        side: THREE.FrontSide
    });
    const leftLine = new THREE.Mesh(leftLineGeometry, leftLineMaterial);
    leftLine.position.x = -roadWidth / 2;
    leftLine.position.y = 0.011;
    roadPiece.add(leftLine);
    
    // Right line
    const rightLineGeometry = new THREE.PlaneGeometry(0.2, segmentLength);
    const rightLineMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffffff,
        side: THREE.FrontSide
    });
    const rightLine = new THREE.Mesh(rightLineGeometry, rightLineMaterial);
    rightLine.position.x = roadWidth / 2;
    rightLine.position.y = 0.011;
    roadPiece.add(rightLine);
    
    scene.add(roadPiece);
    segment.roadMesh = roadPiece;
}

function createGrassSegment(segment) {
    const geometry = new THREE.PlaneGeometry(grassWidth, segmentLength);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x3a5f0b,
        side: THREE.FrontSide
    });
    const grassPiece = new THREE.Mesh(geometry, material);
    grassPiece.position.x = segment.x;
    grassPiece.position.z = segment.z + segmentLength / 2;
    grassPiece.position.y = -0.01;
    grassPiece.rotation.x = -Math.PI / 2;
    
    scene.add(grassPiece);
    segment.grassMesh = grassPiece;

    // Generate banners on both sides
    if (Math.random() < 0.2) { // 20% chance to spawn banners
        const bannerWidth = 5 + Math.random() * 2;
        const bannerHeight = 3 + Math.random() * 1;
        const bannerTexture = bannerTextures[Math.floor(Math.random() * bannerTextures.length)];

        // Left banner
        const leftBannerGeometry = new THREE.PlaneGeometry(bannerWidth, bannerHeight);
        const leftBannerMaterial = new THREE.MeshBasicMaterial({
            map: bannerTexture,
            side: THREE.DoubleSide,
            transparent: true
        });
        const leftBanner = new THREE.Mesh(leftBannerGeometry, leftBannerMaterial);
        leftBanner.position.set(
            segment.x - roadWidth / 2 - bannerWidth / 2 - 2,
            bannerHeight / 2,
            segment.z + segmentLength / 2
        );
        leftBanner.rotation.y = 2 * Math.PI / 2;
        scene.add(leftBanner);
        banners.push({ mesh: leftBanner, z: segment.z + segmentLength / 2 });

        // Right banner
        const rightBannerGeometry = new THREE.PlaneGeometry(bannerWidth, bannerHeight);
        const rightBannerMaterial = new THREE.MeshBasicMaterial({
            map: bannerTexture,
            side: THREE.DoubleSide,
            transparent: true
        });
        const rightBanner = new THREE.Mesh(rightBannerGeometry, rightBannerMaterial);
        rightBanner.position.set(
            segment.x + roadWidth / 2 + bannerWidth / 2 + 2,
            bannerHeight / 2,
            segment.z + segmentLength / 2
        );
        rightBanner.rotation.y = - 2 * Math.PI / 2;
        scene.add(rightBanner);
        banners.push({ mesh: rightBanner, z: segment.z + segmentLength / 2 });
    }

    // Generate trees (5-10 trees per segment for dense forest)
    const treeCount = 5 + Math.floor(Math.random() * 6); // 5 to 10 trees
    for (let i = 0; i < treeCount; i++) {
        createTree(segment);
    }

    const coinCount = 1;
    for (let i = 0; i < coinCount; i++) {
        generateCoin(segment.z);
    }
}

function createCar() {
    car = new THREE.Group();

    // Load the car model
    modelLoader.load(
        './assets/car/scene.gltf',
        (gltf) => {
            const carModel = gltf.scene;
            carModel.scale.set(0.7, 0.7, 0.7);
            carModel.position.y = 0.5;
            carModel.rotation.y = Math.PI;

            modelLoader.load('./assets/fire/scene.gltf', (flameGltf) => {
                const flameModel = flameGltf.scene;
                flameModel.scale.set(2, 2, 2);
                flameModel.position.set(-7.55, 0.5, 8.5); 
                flameModel.rotation.x = Math.PI
                flameModel.visible = false;
                turboFlame = flameModel;

                carModel.add(flameModel);

                flameMixer = new THREE.AnimationMixer(flameModel);
                flameGltf.animations.forEach((clip) => {
                    flameMixer.clipAction(clip).play();
                });
            });

            car.add(carModel);
            scene.add(car);       

        },
        (xhr) => {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        (error) => {
            console.error('Error loading car model:', error);
        }
    );
}


function generateObstacle() {
    const now = Date.now();
    if (now - lastObstacleTime < 500) return;
    
    lastObstacleTime = now;
    
    // Generate obstacles far ahead
    const zPos = car.position.z + 500 + Math.random() * 500; 
    const xPos = (Math.random() - 0.5) * (roadWidth - 4);
    
    const geometry = new THREE.PlaneGeometry(1.9, 2.18);
    const material = new THREE.MeshBasicMaterial({ 
        map: obstacleTexture,
        side: THREE.DoubleSide,
        transparent: true
    });
    const obstacle = new THREE.Mesh(geometry, material);
    obstacle.position.set(xPos, 1.09, zPos);
    obstacle.rotation.y = 2 * Math.PI / 2;
    scene.add(obstacle);
    
    const isMoving = Math.random() < 0.2;
    const amplitude = isMoving ? (Math.random() * 2 + 1) : 0;
    const frequency = isMoving ? (Math.random() * 0.5 + 0.5) : 0;
    const phase = Math.random() * Math.PI * 2;
    
    obstacles.push({
        mesh: obstacle,
        x: xPos,
        z: zPos,
        baseX: xPos,
        amplitude: amplitude,
        frequency: frequency,
        phase: phase
    });
}

function clearRoadAndObstacles() {
    roadSegments.forEach(segment => {
        if (segment.roadMesh) {
            scene.remove(segment.roadMesh);
            segment.roadMesh.geometry.dispose();
            segment.roadMesh.material.dispose();
        }
        if (segment.grassMesh) {
            scene.remove(segment.grassMesh);
            segment.grassMesh.geometry.dispose();
            segment.grassMesh.material.dispose();
        }
    });
    
    obstacles.forEach(obstacle => {
        scene.remove(obstacle.mesh);
        obstacle.mesh.geometry.dispose();
        obstacle.mesh.material.dispose();
    });
    
    banners.forEach(banner => {
        scene.remove(banner.mesh);
        banner.mesh.geometry.dispose();
        banner.mesh.material.dispose();
    });
    
    clouds.forEach(cloud => {
        scene.remove(cloud.mesh);
        cloud.mesh.material.dispose();
    });
    
    trees.forEach(tree => {
        scene.remove(tree.mesh);
        releaseTree(tree.mesh);
    });

    coins.forEach(coin => {
        scene.remove(coin.mesh);
        if (coin.mesh.material) coin.mesh.material.dispose();
    });

    coins = [];
    obstacles = [];
    banners = [];
    clouds = [];
    trees = [];
    roadSegments = [];
    grassSegments = [];
    
    if (car) {
        scene.remove(car);
        car.traverse(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
        car = null;
    }
}

function updateRoad() {
    const lastSegment = roadSegments[roadSegments.length - 1];
    if (car.position.z > lastSegment.z - segmentsCount * segmentLength / 2) {
        const newSegment = {
            x: 0,
            z: lastSegment.z + segmentLength,
            curve: 0,
            start: lastSegment.z,
            end: lastSegment.z + segmentLength
        };
        
        roadSegments.push(newSegment);
        grassSegments.push(newSegment);
        createRoadSegment(newSegment);
        createGrassSegment(newSegment);
        
        if (roadSegments.length > segmentsCount * 1.5) {
            const toRemove = roadSegments.shift();
            grassSegments.shift();
            if (toRemove.roadMesh) {
                scene.remove(toRemove.roadMesh);
                toRemove.roadMesh.geometry.dispose();
                toRemove.roadMesh.material.dispose();
            }
            if (toRemove.grassMesh) {
                scene.remove(toRemove.grassMesh);
                toRemove.grassMesh.geometry.dispose();
                toRemove.grassMesh.material.dispose();
            }
        }
    }
}

function checkCollisions() {
    if (!car) return false;
    
    const carCenter = car.position.clone();
    carCenter.x += 1.4; 
    const carBox = new THREE.Box3().setFromCenterAndSize(
        carCenter,
        new THREE.Vector3(2.7, 1.0, 6.2)
    );

    
    for (const obstacle of obstacles) {
        const obstacleBox = new THREE.Box3().setFromObject(obstacle.mesh);
        if (carBox.intersectsBox(obstacleBox)) {
            return true;
        }
    }
    
    const currentSegment = roadSegments.find(s => car.position.z >= s.start && car.position.z < s.end);
    if (currentSegment) {
        const distanceFromCenter = Math.abs(car.position.x - currentSegment.x);
        if (distanceFromCenter > roadWidth / 2) {
            return true;
        }
    }
    
    return false;
}

function gameOver() {
    gameActive = false;
    
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('bestRacingScore', bestScore);
        bestScoreElement.textContent = `Best: ${bestScore}`;
    }
    
    menuElement.style.display = 'block';
}

function pauseGame() {
    paused = true;
    pauseMenuElement.style.display = 'block';
}

function resumeGame() {
    paused = false;
    pauseMenuElement.style.display = 'none';
}

function quitToMenu() {
    paused = false;
    gameActive = false;
    pauseMenuElement.style.display = 'none';
    menuElement.style.display = 'block';
    clearRoadAndObstacles();
}

function showCarSelection() {
    menuElement.style.display = 'none';
    carSelectionElement.style.display = 'block';
}

function hideCarSelection() {
    carSelectionElement.style.display = 'none';
    menuElement.style.display = 'block';
}

function onKeyDown(event) {
    if (!gameActive) return;
    
    if (event.key === 'Escape') {
        if (paused) {
            resumeGame();
        } else {
            pauseGame();
        }
        event.preventDefault();
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    if (flameMixer) flameMixer.update(delta);
    const elapsedTime = clock.getElapsedTime();

    if (gameActive && !paused) {
        carSpeed = 0.5 + Math.min(2.0, car.position.z * 0.0001);
        
        obstacleFrequency = Math.min(0.1, obstacleFrequency + delta * 0.0002);
        
        if (car) {
            if (keys.ArrowUp && turboLevel > 20) {
                isTurboActive = true;
                turboLevel = Math.max(0, turboLevel - turboConsumptionRate * delta);
            } else {
                isTurboActive = false;
                turboLevel = Math.min(100, turboLevel + turboRechargeRate * delta);
            }

            if (turboFlame) {
                turboFlame.visible = isTurboActive;
            }
            
            const turboBar = document.querySelector('.turbo-bar');
            turboBar.style.width = `${turboLevel}%`;
            
            if (turboLevel > 50) {
                turboBar.style.background = '#00ff00';
            } else if (turboLevel > 20) {
                turboBar.style.background = '#ffff00';
            } else {
                turboBar.style.background = '#ff0000';
            }
            
            const currentSpeed = isTurboActive ? carSpeed * turboSpeedMultiplier : carSpeed;
            
            car.position.z += currentSpeed;
            const baseTurnSpeed = 0.08;
            const speedFactor = currentSpeed; // the faster, the more responsive
            const adjustedTurnSpeed = baseTurnSpeed + speedFactor * 0.04;

            if (keys.ArrowRight) {
                car.position.x -= adjustedTurnSpeed;
                car.rotation.y = Math.min(car.rotation.y + 0.02, Math.PI / 16);
            } else if (keys.ArrowLeft) {
                car.position.x += adjustedTurnSpeed;
                car.rotation.y = Math.max(car.rotation.y - 0.02, -Math.PI / 16);
            } else {
                // Smoothly return to center
                if (car.rotation.y > 0.01) {
                    car.rotation.y -= 0.02;
                } else if (car.rotation.y < -0.01) {
                    car.rotation.y += 0.02;
                } else {
                    car.rotation.y = 0;
                }
            }
            car.position.x = Math.max(-roadWidth, Math.min(roadWidth, car.position.x));
            
            camera.position.z = car.position.z - 15;
            camera.position.x = car.position.x;
            camera.lookAt(car.position.x, car.position.y, car.position.z + 10);
        }
        
        updateRoad();

        coins = coins.filter(coin => {
            const carBox = new THREE.Box3().setFromObject(car);
            const coinBox = new THREE.Box3().setFromObject(coin.mesh);

            if (carBox.intersectsBox(coinBox) && !coin.collected) {
                coin.collected = true;
                scene.remove(coin.mesh);
                releaseCoin(coin.mesh);
                score += 10;
                scoreElement.textContent = `Score: ${Math.floor(score)}`;
                return false;
            }

            if (coin.mesh.position.z < car.position.z - 30) {
                scene.remove(coin.mesh);
                releaseCoin(coin.mesh);
                return false;
            }

            return true;
        });
        
        // Maintain 10 obstacles by repositioning
        obstacles = obstacles.filter(obstacle => {
            if (obstacle.z < car.position.z - 20) {
                // Reposition far ahead instead of removing
                obstacle.z = car.position.z + 500 + Math.random() * 500; // Z: 500 to 1000 ahead
                obstacle.x = (Math.random() - 0.5) * (roadWidth - 4);
                obstacle.baseX = obstacle.x;
                obstacle.mesh.position.set(obstacle.x, 1.09, obstacle.z);
                obstacle.isMoving = Math.random() < 0.2;
                obstacle.amplitude = obstacle.isMoving ? (Math.random() * 2 + 1) : 0;
                obstacle.frequency = obstacle.isMoving ? (Math.random() * 0.5 + 0.5) : 0;
                obstacle.phase = Math.random() * Math.PI * 2;
                return true;
            }
            if (obstacle.amplitude !== 0) {
                obstacle.x = obstacle.baseX + obstacle.amplitude * Math.sin(obstacle.frequency * elapsedTime + obstacle.phase);
                obstacle.x = Math.max(-roadWidth / 2 + 1, Math.min(roadWidth / 2 - 1, obstacle.x));
                obstacle.mesh.position.x = obstacle.x;
            }
            return true;
        });
        
        // Ensure approximately 10 obstacles
        while (obstacles.length < 10 && Math.random() < obstacleFrequency) {
            generateObstacle();
        }
        
        banners = banners.filter(banner => {
            if (banner.z < car.position.z - 20) {
                scene.remove(banner.mesh);
                banner.mesh.geometry.dispose();
                banner.mesh.material.dispose();
                return false;
            }
            return true;
        });
        
        // Update clouds
        clouds.forEach(cloud => {
            cloud.mesh.position.x += cloud.driftSpeed * delta * 10;
            cloud.z = cloud.mesh.position.z;
            
            // Reposition clouds that move too far behind or to the sides
            if (cloud.z < car.position.z - 100 || Math.abs(cloud.mesh.position.x) > 250) {
                // Reposition far ahead
                cloud.mesh.position.set(
                    (Math.random() - 0.5) * 400, // X: -200 to 200
                    20 + Math.random() * 20,    // Y: 20 to 40
                    car.position.z + 500 + Math.random() * 1000 // Z: 500 to 1500 ahead
                );
                cloud.z = cloud.mesh.position.z;
                cloud.driftSpeed = 0.02 + Math.random() * 0.03; // Reset drift speed
            }
        });
        
        // Ensure approximately 20 clouds
        while (clouds.length < 20) {
            createCloud();
        }
        
        trees = trees.filter(tree => {
            if (tree.z < car.position.z - 100) {
                scene.remove(tree.mesh);
                releaseTree(tree.mesh); // 👈
                return false;
            }
            return true;
        });
        
        if (checkCollisions()) {
            gameOver();
        }
    }
    
    renderer.render(scene, camera);
}

const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false
};

function handleTouchStart(key) {
    keys[key] = true;
}
function handleTouchEnd(key) {
    keys[key] = false;
}

// Привязка событий
btnLeft.addEventListener('touchstart', () => handleTouchStart('ArrowLeft'));
btnLeft.addEventListener('touchend', () => handleTouchEnd('ArrowLeft'));

btnRight.addEventListener('touchstart', () => handleTouchStart('ArrowRight'));
btnRight.addEventListener('touchend', () => handleTouchEnd('ArrowRight'));

btnUp.addEventListener('touchstart', () => handleTouchStart('ArrowUp'));
btnUp.addEventListener('touchend', () => handleTouchEnd('ArrowUp'));

document.addEventListener('keydown', (event) => {
    event.preventDefault()
    if (event.key in keys) {
        keys[event.key] = true;
    }
});

document.addEventListener('keyup', (event) => {
    event.preventDefault()
    if (event.key in keys) {
        keys[event.key] = false;
    }
});