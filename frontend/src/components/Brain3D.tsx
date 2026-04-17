import { useEffect, useRef } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

export function Brain3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const targetZoomRef = useRef<number>(65);
  const currentZoomRef = useRef<number>(65);

  useEffect(() => {
    if (!containerRef.current) return;

    const W = window.innerWidth;
    const H = window.innerHeight;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 2000);
    camera.position.set(0, 0, currentZoomRef.current);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);
    const rimLight = new THREE.PointLight(0x6366f1, 3, 500);
    rimLight.position.set(-50, 20, 50);
    scene.add(rimLight);
    const rimLight2 = new THREE.PointLight(0xa855f7, 2.5, 500);
    rimLight2.position.set(50, -20, -30);
    scene.add(rimLight2);    // Load FBX — scale to fill most of the screen
    const loader = new FBXLoader();
    loader.load("/Brain.fbx", (object) => {
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      // Fill ~80% of the viewport height in world units
      const targetSize = (2 * Math.tan(THREE.MathUtils.degToRad(25)) * currentZoomRef.current) * 1.1;
      const scale = targetSize / maxDim;
      object.scale.setScalar(scale);

      // Center
      const box2 = new THREE.Box3().setFromObject(object);
      const center = box2.getCenter(new THREE.Vector3());
      object.position.sub(center);

      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m: THREE.MeshStandardMaterial) => {
            if (m) {
              m.emissive = new THREE.Color(0x6366f1);
              m.emissiveIntensity = 0.2;
            }
          });
        }
      });

      scene.add(object);
      modelRef.current = object;
    });

    // Scroll zoom — listen on document so page scroll still works
    // We only zoom, not prevent default, so scrolling is unblocked
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const maxScroll = document.body.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? scrollY / maxScroll : 0;
      // zoom in as user scrolls down: 100 → 30
      targetZoomRef.current = 65 - progress * 45;
    };

    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      // Smooth zoom
      currentZoomRef.current += (targetZoomRef.current - currentZoomRef.current) * 0.06;
      camera.position.z = currentZoomRef.current;
      // Gentle auto-rotate
      if (modelRef.current) {
        modelRef.current.rotation.y += 0.003;
      }
      renderer.render(scene, camera);
    };
    animate();

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll);
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[1]"
      style={{ pointerEvents: "none", opacity: 0.5 }}
    />
  );
}
