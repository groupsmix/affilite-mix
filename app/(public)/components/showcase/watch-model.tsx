"use client";

import { forwardRef } from "react";
import type { Group } from "three";

/**
 * Placeholder watch built from primitives:
 * - Cylinder case + bezel ring (front)
 * - Dial with hour markers and hands (front)
 * - Engraved-style caseback (rear, visible after the 180° scroll rotation)
 * - Crown on the side and strap segments top/bottom
 */
export const WatchModel = forwardRef<Group>(function WatchModel(_props, ref) {
  return (
    <group ref={ref}>
      {/* Case */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1, 1, 0.32, 64]} />
        <meshStandardMaterial color="#b8b8bc" metalness={0.95} roughness={0.2} />
      </mesh>

      {/* Bezel */}
      <mesh position={[0, 0, 0.17]}>
        <torusGeometry args={[0.94, 0.09, 24, 96]} />
        <meshStandardMaterial color="#c9a227" metalness={1} roughness={0.25} />
      </mesh>

      {/* Dial */}
      <mesh position={[0, 0, 0.165]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.86, 0.86, 0.02, 64]} />
        <meshStandardMaterial color="#0d0d10" metalness={0.4} roughness={0.35} />
      </mesh>

      {/* Hour markers */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.sin(angle) * 0.72, Math.cos(angle) * 0.72, 0.18]}
            rotation={[0, 0, -angle]}
          >
            <boxGeometry args={[0.05, 0.14, 0.02]} />
            <meshStandardMaterial color="#c9a227" metalness={0.9} roughness={0.3} />
          </mesh>
        );
      })}

      {/* Hands */}
      <mesh position={[0, 0.22, 0.19]}>
        <boxGeometry args={[0.045, 0.5, 0.015]} />
        <meshStandardMaterial color="#e8e8ea" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0.18, 0.1, 0.2]} rotation={[0, 0, -Math.PI / 3]}>
        <boxGeometry args={[0.035, 0.62, 0.015]} />
        <meshStandardMaterial color="#e8e8ea" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0, 0.21]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.03, 32]} />
        <meshStandardMaterial color="#c9a227" metalness={1} roughness={0.2} />
      </mesh>

      {/* Caseback (rear) */}
      <mesh position={[0, 0, -0.17]}>
        <torusGeometry args={[0.78, 0.07, 20, 80]} />
        <meshStandardMaterial color="#8f8f94" metalness={0.95} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, -0.165]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.74, 0.74, 0.02, 64]} />
        <meshStandardMaterial color="#3a3a40" metalness={0.85} roughness={0.4} />
      </mesh>
      {/* Caseback "rotor" detail */}
      <mesh position={[0, 0.2, -0.19]} rotation={[Math.PI / 2, 0, 0.5]}>
        <cylinderGeometry args={[0.32, 0.32, 0.02, 48, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#c9a227" metalness={1} roughness={0.25} />
      </mesh>

      {/* Crown */}
      <mesh position={[1.08, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.12, 0.12, 0.14, 24]} />
        <meshStandardMaterial color="#c9a227" metalness={1} roughness={0.3} />
      </mesh>

      {/* Strap */}
      <mesh position={[0, 1.35, 0]}>
        <boxGeometry args={[0.62, 1.5, 0.14]} />
        <meshStandardMaterial color="#1a1a1e" metalness={0.1} roughness={0.85} />
      </mesh>
      <mesh position={[0, -1.35, 0]}>
        <boxGeometry args={[0.62, 1.5, 0.14]} />
        <meshStandardMaterial color="#1a1a1e" metalness={0.1} roughness={0.85} />
      </mesh>
      {/* Lugs */}
      <mesh position={[0, 0.98, 0]}>
        <boxGeometry args={[0.72, 0.18, 0.2]} />
        <meshStandardMaterial color="#b8b8bc" metalness={0.95} roughness={0.25} />
      </mesh>
      <mesh position={[0, -0.98, 0]}>
        <boxGeometry args={[0.72, 0.18, 0.2]} />
        <meshStandardMaterial color="#b8b8bc" metalness={0.95} roughness={0.25} />
      </mesh>
    </group>
  );
});
