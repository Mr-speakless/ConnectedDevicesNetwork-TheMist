// src/GradientBg.jsx
import { ShaderGradientCanvas, ShaderGradient } from "@shadergradient/react";

export default function GradientBg() {
    return (
        <ShaderGradientCanvas
            style={{
                position: "fixed",
                inset: 0,
                width: "100vw",
                height: "100vh",
                zIndex: 0,
                pointerEvents: "none",
            }}
        >
            <ShaderGradient
                animate="on"
                axesHelper="on"
                brightness={1}
                cAzimuthAngle={180}
                cDistance={3.9}
                cPolarAngle={115}
                cameraZoom={1}
                color1="#FFFFFF"
                color2="#D0B488"
                color3="#1D1D1D"
                destination="onCanvas"
                embedMode="off"
                envPreset="city"
                format="gif"
                fov={45}
                frameRate={10}
                gizmoHelper="hide"
                grain="off"
                lightType="3d"
                pixelDensity={0.9}
                positionX={-0.5}
                positionY={0.1}
                positionZ={0}
                range="disabled"
                rangeEnd={40}
                rangeStart={0}
                reflection={0.1}
                rotationX={0}
                rotationY={0}
                rotationZ={235}
                shader="defaults"
                type="waterPlane"
                uAmplitude={0}
                uDensity={1.3}
                uFrequency={5.5}
                uSpeed={0.1}
                uStrength={1.5}
                uTime={0.2}
                wireframe={false}
            />
        </ShaderGradientCanvas>
    );
}
