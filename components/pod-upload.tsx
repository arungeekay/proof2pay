"use client";

// Carrier's delivery upload. "Generate demo POD" draws a POD and two photos in the browser, dated today, so the
// demo works on any day; every generated image is captioned as generated. Real files can be chosen instead.

import { useRef, useState } from "react";
import type { ActionResult } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface Props {
  action: (state: ActionResult, form: FormData) => Promise<ActionResult>;
  shipmentId: string;
  reference: string;
  buyerName: string;
  buyerCity: string;
  carrierName: string;
  trackingNumber: string;
  quantity: number;
  unit: string;
}

function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return [c, c.getContext("2d")!] as const;
}

function drawPod(p: Props, damaged: boolean) {
  const [c, g] = canvas(1000, 1300);
  g.fillStyle = "#fffef8";
  g.fillRect(0, 0, 1000, 1300);
  g.fillStyle = "#111";
  g.font = "bold 40px Arial";
  g.fillText("PROOF OF DELIVERY", 60, 90);
  g.font = "22px Arial";
  g.fillText(p.carrierName, 60, 130);
  g.strokeStyle = "#333";
  g.lineWidth = 2;
  g.strokeRect(40, 160, 920, 1080);
  const today = new Date().toISOString().slice(0, 10);
  const rows: [string, string][] = [
    ["Consignment ref", p.reference],
    ["Tracking number", p.trackingNumber],
    ["Consignee", p.buyerName],
    ["Delivery address", `Receiving dock 3, ${p.buyerCity}`],
    ["Date of delivery", today],
    ["Packages delivered", `${p.quantity} ${p.unit}`],
    ["Seals", "Intact"],
  ];
  rows.forEach(([k, v], i) => {
    const y = 220 + i * 70;
    g.font = "20px Arial";
    g.fillStyle = "#555";
    g.fillText(k, 70, y);
    g.font = "bold 26px Arial";
    g.fillStyle = "#111";
    g.fillText(v, 330, y);
    g.beginPath();
    g.moveTo(60, y + 22);
    g.lineTo(940, y + 22);
    g.strokeStyle = "#ccc";
    g.stroke();
  });
  g.font = "20px Arial";
  g.fillStyle = "#555";
  g.fillText("Receiver's remarks", 70, 740);
  g.font = "italic 30px 'Segoe Script', 'Bradley Hand', cursive";
  g.fillStyle = "#1a3a8a";
  if (damaged) {
    g.fillText(`Received ${p.quantity} ${p.unit}. 1 carton dented at`, 70, 795);
    g.fillText("one corner (carton 17). Contents not inspected.", 70, 840);
  } else {
    g.fillText(`Received ${p.quantity} ${p.unit} in good order.`, 70, 795);
  }
  g.font = "20px Arial";
  g.fillStyle = "#555";
  g.fillText("Received by (name and signature)", 70, 950);
  g.font = "italic 30px 'Segoe Script', 'Bradley Hand', cursive";
  g.fillStyle = "#1a3a8a";
  g.fillText("Laura Chen", 70, 1000);
  g.beginPath();
  g.moveTo(420, 1010);
  g.bezierCurveTo(470, 920, 520, 1060, 570, 980);
  g.bezierCurveTo(610, 930, 640, 1040, 700, 990);
  g.bezierCurveTo(730, 970, 760, 1000, 800, 985);
  g.strokeStyle = "#1a3a8a";
  g.lineWidth = 3;
  g.stroke();
  g.beginPath();
  g.arc(800, 1150, 70, 0, Math.PI * 2);
  g.strokeStyle = "#b42318";
  g.lineWidth = 4;
  g.stroke();
  g.font = "bold 20px Arial";
  g.fillStyle = "#b42318";
  g.fillText("RECEIVED", 748, 1145);
  g.fillText(today, 745, 1172);
  g.font = "16px Arial";
  g.fillStyle = "#888";
  g.fillText("Generated in Proof2Pay for the demo", 60, 1280);
  return c;
}

function drawPhoto(damaged: boolean, closeUp: boolean) {
  const [c, g] = canvas(1000, 750);
  g.fillStyle = "#9aa3ad";
  g.fillRect(0, 0, 1000, 750);
  g.fillStyle = "#6b7280";
  g.fillRect(0, 560, 1000, 190);
  const box = (x: number, y: number, w: number, h: number, dent: boolean) => {
    g.fillStyle = "#c08a4e";
    g.fillRect(x, y, w, h);
    g.strokeStyle = "#7a5228";
    g.lineWidth = 2;
    g.strokeRect(x, y, w, h);
    g.fillStyle = "#d9b47c";
    g.fillRect(x + w * 0.42, y, w * 0.16, h);
    if (dent) {
      g.fillStyle = "#6e4520";
      g.beginPath();
      g.moveTo(x + w, y);
      g.lineTo(x + w * 0.62, y + h * 0.08);
      g.lineTo(x + w * 0.78, y + h * 0.42);
      g.lineTo(x + w, y + h * 0.3);
      g.closePath();
      g.fill();
      g.strokeStyle = "#3d250e";
      g.beginPath();
      g.moveTo(x + w * 0.65, y + h * 0.1);
      g.lineTo(x + w * 0.9, y + h * 0.35);
      g.stroke();
    }
  };
  if (closeUp) {
    box(260, 150, 480, 400, damaged);
  } else {
    g.fillStyle = "#8b6b3e";
    g.fillRect(150, 540, 700, 40);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) box(160 + col * 136, 400 - row * 120, 130, 115, damaged && row === 2 && col === 3);
  }
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.fillRect(0, 700, 1000, 50);
  g.fillStyle = "#fff";
  g.font = "20px Arial";
  g.fillText(`${closeUp ? "Close-up" : "Pallet on arrival"}: generated demo photo`, 20, 732);
  return c;
}

const toFile = (c: HTMLCanvasElement, name: string) =>
  new Promise<File>((resolve) => c.toBlob((blob) => resolve(new File([blob!], name, { type: "image/png" })), "image/png"));

export function PodUpload(props: Props) {
  const podRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [damaged, setDamaged] = useState(true);

  async function generate() {
    const pod = await toFile(drawPod(props, damaged), `POD-${props.reference}.png`);
    const photos = [await toFile(drawPhoto(damaged, false), "photo-pallet.png"), await toFile(drawPhoto(damaged, true), "photo-closeup.png")];
    const podFiles = new DataTransfer();
    podFiles.items.add(pod);
    podRef.current!.files = podFiles.files;
    const photoFiles = new DataTransfer();
    photos.forEach((p) => photoFiles.items.add(p));
    photosRef.current!.files = photoFiles.files;
    setPreviews([pod, ...photos].map((f) => URL.createObjectURL(f)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={generate}>
          Generate demo POD and photos
        </Button>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={damaged} onChange={(e) => setDamaged(e.target.checked)} /> include one dented carton (scenario 3)
        </label>
      </div>
      {previews.length > 0 && (
        <div className="flex gap-2">
          {previews.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="generated evidence preview" className="h-28 rounded border object-cover" />
          ))}
        </div>
      )}
      <ActionForm action={props.action} fields={{ shipmentId: props.shipmentId }} label="Upload and verify with Delivery AI" pendingLabel="Delivery AI is reading the documents…">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pod">Signed POD (PNG, JPEG, WebP or PDF)</Label>
            <input ref={podRef} id="pod" name="pod" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="photos">Delivery photos</Label>
            <input ref={photosRef} id="photos" name="photos" type="file" multiple accept="image/png,image/jpeg,image/webp" className="text-xs" />
          </div>
        </div>
      </ActionForm>
    </div>
  );
}
