import { NextResponse } from "next/server";
import { store } from "@/src/lib/orchestrator";

export async function GET() { return NextResponse.json({ receipts: await store.listReceipts("demo") }); }
