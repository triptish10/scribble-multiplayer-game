import { useEffect, useRef, useState, type PointerEvent } from "react";
import socket from "../socket";
type DrawingCanvasProps = {
    disabled?: boolean;
    roomId: string;
};
type Point = {
    x: number;
    y: number;
};
type Stroke = {
    points: Point[];
    color: string;
    size: number;
};
type DrawData = {
    type: "start" | "move" | "end";
    playerId: string;
    x?: number;
    y?: number;
    color?: string;
    size?: number;
};
const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 500;
function DrawingCanvas({ disabled = false, roomId }: DrawingCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const strokesRef = useRef<Stroke[]>([]);
    const currentStrokeRef = useRef<Stroke | null>(null);
    const isDrawingRef = useRef(false);
    const remoteStrokeRef = useRef<Stroke | null>(null);
    const [color, setColor] = useState("#000000");
    const [size, setSize] = useState(5);
    const [canUndo, setCanUndo] = useState(false);
    function getCanvasPoint(event: PointerEvent | PointerEvent<HTMLCanvasElement>): Point | null {
        const canvas = canvasRef.current;
        if (!canvas) {
            return null;
        }
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            return null;
        }
        return {
            x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
            y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
        };
    }
    function drawStroke(stroke: Stroke) {
        const canvas = canvasRef.current;
        if (!canvas || stroke.points.length === 0) {
            return;
        }
        const context = canvas.getContext("2d");
        if (!context) {
            return;
        }
        context.strokeStyle = stroke.color;
        context.fillStyle = stroke.color;
        context.lineWidth = stroke.size;
        context.lineCap = "round";
        context.lineJoin = "round";
        if (stroke.points.length === 1) {
            const point = stroke.points[0];
            context.beginPath();
            context.arc(point.x, point.y, stroke.size / 2, 0, Math.PI * 2);
            context.fill();
            return;
        }
        context.beginPath();
        context.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let index = 1; index < stroke.points.length; index += 1) {
            context.lineTo(stroke.points[index].x, stroke.points[index].y);
        }
        context.stroke();
    }
    function redrawCanvas() {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }
        const context = canvas.getContext("2d");
        if (!context) {
            return;
        }
        context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        for (const stroke of strokesRef.current) {
            drawStroke(stroke);
        }
        if (currentStrokeRef.current) {
            drawStroke(currentStrokeRef.current);
        }
        if (remoteStrokeRef.current) {
            drawStroke(remoteStrokeRef.current);
        }
    }
    function updateUndoState() {
        setCanUndo(strokesRef.current.length > 0);
    }
    function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
        if (disabled || !roomId) {
            return;
        }
        const point = getCanvasPoint(event);
        if (!point) {
            return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        isDrawingRef.current = true;
        const stroke: Stroke = {
            points: [point],
            color,
            size,
        };
        currentStrokeRef.current = stroke;
        drawStroke(stroke);
        socket.emit("draw_start", {
            roomId,
            x: point.x,
            y: point.y,
            color,
            size,
        });
    }
    function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
        if (!isDrawingRef.current || disabled || !roomId) {
            return;
        }
        const point = getCanvasPoint(event);
        if (!point || !currentStrokeRef.current) {
            return;
        }
        const previousPoint =
            currentStrokeRef.current.points[
            currentStrokeRef.current.points.length - 1
            ];
        currentStrokeRef.current.points.push(point);
        const context = canvasRef.current?.getContext("2d");
        if (context) {
            context.strokeStyle = currentStrokeRef.current.color;
            context.lineWidth = currentStrokeRef.current.size;
            context.lineCap = "round";
            context.lineJoin = "round";
            context.beginPath();
            context.moveTo(previousPoint.x, previousPoint.y);
            context.lineTo(point.x, point.y);
            context.stroke();
        }
        socket.emit("draw_move", {
            roomId,
            x: point.x,
            y: point.y,
        });
    }
    function finishDrawing(event?: PointerEvent<HTMLCanvasElement>) {
        if (!isDrawingRef.current) {
            return;
        }
        isDrawingRef.current = false;
        if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (currentStrokeRef.current) {
            strokesRef.current.push(currentStrokeRef.current);
            currentStrokeRef.current = null;
            updateUndoState();
        }
        if (roomId) {
            socket.emit("draw_end", { roomId });
        }
    }
    function handleUndo() {
        if (disabled || !roomId || strokesRef.current.length === 0) {
            return;
        }
        socket.emit("draw_undo", { roomId });
    }
    function handleClear() {
        if (disabled || !roomId) {
            return;
        }
        socket.emit("canvas_clear", { roomId });
    }
    useEffect(() => {
        redrawCanvas();
    }, []);
    useEffect(() => {
        function handleDrawData(data: DrawData) {
            if (!data || data.playerId === socket.id) {
                return;
            }
            if (data.type === "start") {
                if (typeof data.x !== "number" || typeof data.y !== "number") {
                    return;
                }
                remoteStrokeRef.current = {
                    points: [{ x: data.x, y: data.y }],
                    color: data.color || "#000000",
                    size: typeof data.size === "number" ? data.size : 5,
                };
                redrawCanvas();
                return;
            }
            if (data.type === "move") {
                if (
                    !remoteStrokeRef.current ||
                    typeof data.x !== "number" ||
                    typeof data.y !== "number"
                ) {
                    return;
                }
                const stroke = remoteStrokeRef.current;
                const previousPoint = stroke.points[stroke.points.length - 1];
                const point = { x: data.x, y: data.y };
                stroke.points.push(point);
                const context = canvasRef.current?.getContext("2d");
                if (context) {
                    context.strokeStyle = stroke.color;
                    context.lineWidth = stroke.size;
                    context.lineCap = "round";
                    context.lineJoin = "round";
                    context.beginPath();
                    context.moveTo(previousPoint.x, previousPoint.y);
                    context.lineTo(point.x, point.y);
                    context.stroke();
                }
                return;
            }
            if (data.type === "end") {
                if (remoteStrokeRef.current) {
                    strokesRef.current.push(remoteStrokeRef.current);
                    remoteStrokeRef.current = null;
                    updateUndoState();
                }
            }
        }
        function handleCanvasClear(data: { playerId: string }) {
            if (!data) {
                return;
            }
            strokesRef.current = [];
            currentStrokeRef.current = null;
            remoteStrokeRef.current = null;
            isDrawingRef.current = false;
            updateUndoState();
            redrawCanvas();
        }
        function handleDrawUndo(data: { playerId: string }) {
            if (!data) {
                return;
            }
            if (remoteStrokeRef.current) {
                remoteStrokeRef.current = null;
            }
            if (strokesRef.current.length > 0) {
                strokesRef.current.pop();
            }
            updateUndoState();
            redrawCanvas();
        }
        socket.on("draw_data", handleDrawData);
        socket.on("canvas_clear", handleCanvasClear);
        socket.on("draw_undo", handleDrawUndo);
        return () => {
            socket.off("draw_data", handleDrawData);
            socket.off("canvas_clear", handleCanvasClear);
            socket.off("draw_undo", handleDrawUndo);
        };
    }, [roomId]);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }
        const context = canvas.getContext("2d");
        if (!context) {
            return;
        }
        context.lineCap = "round";
        context.lineJoin = "round";
    }, []);
    return (
        <div className="drawing-canvas-wrapper">
            <div
                style={{
                    position: "relative",
                    width: "100%",
                    maxWidth: `${CANVAS_WIDTH}px`,
                    margin: "0 auto",
                }}
            >
                <canvas
                    ref={canvasRef}
                    width={CANVAS_WIDTH}
                    height={CANVAS_HEIGHT}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={finishDrawing}
                    onPointerCancel={finishDrawing}
                    style={{
                        display: "block",
                        width: "100%",
                        height: "auto",
                        background: "#ffffff",
                        border: "1px solid #d8d8d8",
                        borderRadius: "10px",
                        cursor: disabled ? "default" : "crosshair",
                        touchAction: "none",
                    }}
                />
            </div>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexWrap: "wrap",
                    gap: "10px",
                    marginTop: "10px",
                }}
            >
                <label>
                    Color{" "}
                    <input
                        type="color"
                        value={color}
                        onChange={(event) => setColor(event.target.value)}
                        disabled={disabled}
                        aria-label="Drawing color"
                    />
                </label>
                <label>
                    Brush size{" "}
                    <input
                        type="range"
                        min="1"
                        max="30"
                        value={size}
                        onChange={(event) => setSize(Number(event.target.value))}
                        disabled={disabled}
                        aria-label="Brush size"
                    />
                    <span>{size}px</span>
                </label>
                <button type="button" onClick={handleUndo} disabled={disabled || !canUndo}>
                    ↩ Undo
                </button>
                <button type="button" onClick={handleClear} disabled={disabled}>
                    🗑 Clear
                </button>
            </div>
        </div>
    );
}
export default DrawingCanvas;
