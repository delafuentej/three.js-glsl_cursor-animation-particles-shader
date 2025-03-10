import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import particlesVertexShader from './shaders/particles/vertex.glsl';
import particlesFragmentShader from './shaders/particles/fragment.glsl';

/**
 * Steps -Animate-Particles-Cursor: we want to animater the particles when the cursor hovers the picture. The particles will stay
 * elevated for a brief moment event though the cursor is already gone. Despite we need to use canvas2D
 * - How to use a 2D Canvas as a texture
 * 1.PARTICLES. The particles to be discs. Size depend on the brightness od the picture. Modify the color of the particles to machtch the picture
 * - Disc Shape: We are not going tu use texture, not a fancy pattern, only draw discs.
 *  we want UV coordinates inside each particle and since they are points (gl_PointSize) we can use gl_PointCoord: in fragment.glsl vec2 uv = gl_PointCoord;
 * and send it to gl_FragColor
 * So we have the distance (float distanceToCenter = distance(uv, vec2(0.5)); we are goint to use discard instead alpha (bugs).
 * Discard prevent the fragment from being drawn entirely without even relying on transparency
 * Texture in the folder static, choose one picture and use it to handle the size of the particles first => uniforms:  uPictureTexture
 *  Then  we are going to pick the picture at uv coordinates & swizzle the r channel; after handle the PointSize using the pictureIntensity:  gl_PointSize = 0.3 * uResolution.y * pictureIntensity;
 * Change the color & make the small one darker vec3 vColor & assign it to pictureIntensity: varying vec3 vColor & applied it to gl_FragColor:  gl_FragColor = vec4(vColor, 1.0);
 * increment(crush) the intensity of vColor with pow function in vertex.glsl & than add more particle & reduce the gl_Po
 * 2.2DCANVAS (to draw shapes, draw images, transform pixels, add gradients, animate everytin, erase some parts, change how the pixels we draw merges with the pixels already drawn, etc)
 * We are going to put it(related to canvas) in a displacement object (before particlds). We need to create a new canvas
 * To draq onto the canvas we need its context => WebGL Context(Three.js) ; we need a "2D Context". The context contains a bunch of methods...
 * -We need to load the image but not the TextureLoader (pure JS)
 * -To draw the glow: first we need to load the image in vanilla JS: Draw on cursor coordinates: we are going to use the Raycaster,
 * but Raycaster will not work with the particles because it requires a geometry made out of vertices and triangles, we need to fix that
 * We are goint to create a Plane and use the Raycaster on that plane.
 * Raycaster => we need the cursor coordinates of cursor
 * DRAW THE GLOW ON THE CANVAS
 * DISPLACEMENT AS A TEXTURE: Usung the canvas as a Texture=> Send the Canvas to the Shader : through CanvasTexture instance & update the texture
 * after updating the canvas. Creation new uniform : uDisplacementTexture
 * DISPLACEMENT ANIMATION: We want to move the particles according to the displacement texture. Updating the position before we send it to the modelPosition
 * Create a attribute aIntensity & then a random angle too like a attribute.
 */
/**
 * Base
 */
// Canvas
const canvas = document.querySelector('canvas.webgl');

// Scene
const scene = new THREE.Scene();

// Loaders
const textureLoader = new THREE.TextureLoader();

//

/**
 * Sizes
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: Math.min(window.devicePixelRatio, 2)
};

window.addEventListener('resize', () =>
{
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight
    sizes.pixelRatio = Math.min(window.devicePixelRatio, 2)

    // Materials
    particlesMaterial.uniforms.uResolution.value.set(sizes.width * sizes.pixelRatio, sizes.height * sizes.pixelRatio)

    // Update camera
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(sizes.pixelRatio)
});

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(35, sizes.width / sizes.height, 0.1, 100);
camera.position.set(0, 0, 18);
scene.add(camera);

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true
});
renderer.setClearColor('#181818');
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(sizes.pixelRatio);

/**
 * DISPLACEMENT
 */
const displacement = {};
displacement.canvas = document.createElement('canvas');
displacement.canvas.width = 128;
displacement.canvas.height = 128;
document.body.append(displacement.canvas)
displacement.canvas.classList.add('drawing');

//2D Context
displacement.context = displacement.canvas.getContext('2d');
displacement.context.fillStyle = 'rgb(0,0,0,0.3)';
displacement.context.fillRect(0, 0, displacement.canvas.width, displacement.canvas.height);
// to add it to the DOM


//Glow image
displacement.glowImage = new Image();
displacement.glowImage.src = './glow.png';

// Interactive Plane
displacement.interactivePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshBasicMaterial({ color: 'gold',side: THREE.DoubleSide})
);
displacement.interactivePlane.visible = false;
scene.add(displacement.interactivePlane);

//Raycaster
displacement.raycaster = new THREE.Raycaster();
//Coordinates:the cursor's default position will be at the center of the picture
displacement.screenCursor = new THREE.Vector2(9999,9999);
displacement.canvasCursor = new THREE.Vector2(9999,9999);
displacement.canvasPreviousCursor = new THREE.Vector2(9999,9999);
//When the cursor moves, we want to update the coordinates => in touch screen

window.addEventListener('pointermove', (e) => {
    displacement.screenCursor.x = (e.clientX / sizes.width) * 2 - 1;
    displacement.screenCursor.y = - (e.clientY / sizes.height) * 2 + 1;
  
});
/**
 * Texture on our Canvas
 */
displacement.texture = new THREE.CanvasTexture(displacement.canvas);
/**
 * Particles
 */
const particlesGeometry = new THREE.PlaneGeometry(10, 10, 128, 128);
particlesGeometry.setIndex(null);
particlesGeometry.deleteAttribute('normal');
//create a intensity attribute //particlesGeometry.attributes.position.count => how many particles we have
const particlesCount = particlesGeometry.attributes.position.count;
const intensitiesArray = new Float32Array(particlesCount);
const anglesArray =  new Float32Array(particlesCount);

for(let i = 0; i < particlesCount; i++){
    intensitiesArray[i] = Math.random();
    anglesArray[i] = Math.random() * Math.PI * 2;//full circle
}

particlesGeometry.setAttribute('aIntensity', new THREE.BufferAttribute(intensitiesArray, 1));
particlesGeometry.setAttribute('aAngle', new THREE.BufferAttribute(anglesArray, 1));


const particlesMaterial = new THREE.ShaderMaterial({
    vertexShader: particlesVertexShader,
    fragmentShader: particlesFragmentShader,
    uniforms:
    {
        uResolution: new THREE.Uniform(new THREE.Vector2(sizes.width * sizes.pixelRatio, sizes.height * sizes.pixelRatio)),
        uPictureTexture: new THREE.Uniform(textureLoader.load('./me.png')),
        uDisplacementTexture: new THREE.Uniform(displacement.texture)
    },
   //blending: THREE.AdditiveBlending
});
const particles = new THREE.Points(particlesGeometry, particlesMaterial);
scene.add(particles);

/**
 * Animate
 */
const tick = () =>
{
    // Update controls
    controls.update();

      /**
     * Raycaster
     */
    //Update Raycaster
    displacement.raycaster.setFromCamera(displacement.screenCursor, camera);
    //to test the intersection with interactivePlane:
    const intersections = displacement.raycaster.intersectObject(displacement.interactivePlane);

    //  hovering the plain: the raycaster will retrieve the uv coordinates if there is a uv attribute
    // on the geometry. it will just interpolate the value
    if(intersections.length){
       //notive => uv goes from 0 to 1; canvas goes from 0 to 128
        const uv = intersections[0].uv;
        //updating the canvasCursor using the uv
        displacement.canvasCursor.x =   uv.x * displacement.canvas.width;//0 to 1
        displacement.canvasCursor.y =  (1 - uv.y) * displacement.canvas.height;//1 to 0
        
    };
    /**
     * Displacement
     */
    //Fade-out
    displacement.context.globalCompositeOperation = 'source-over';
    displacement.context.globalAlpha = 0.02;
    displacement.context.fillRect(0, 0, displacement.canvas.width, displacement.canvas.height);

    //Speed Alpha- cursor speed
    const cursorDistance = displacement.canvasPreviousCursor.distanceTo(displacement.canvasCursor);
    displacement.canvasPreviousCursor.copy(displacement.canvasCursor);
    const alpha = Math.min(cursorDistance * 0.1, 1);
    //Drawing glow
    const glowSize = displacement.canvas.width * 0.25;
    displacement.context.globalCompositeOperation = 'lighten';//like as AdditiveBlending
    displacement.context.globalAlpha = alpha;
    displacement.context.drawImage(
        displacement.glowImage,
        displacement.canvasCursor.x - glowSize * 0.5,
       displacement.canvasCursor.y - glowSize * 0.5,
        glowSize,
        glowSize
    );
     /**
     * UPDATE TEXTURE
     */
    displacement.texture.needsUpdate = true;
    // Render
    renderer.render(scene, camera);

    // Call tick again on the next frame
    window.requestAnimationFrame(tick);
}

tick()