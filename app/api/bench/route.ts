import { NextResponse } from "next/server";
import { runBench } from "@/src/lib/bench";

export async function GET() { return NextResponse.json(await runBench()); }
export async function POST() { return NextResponse.json(await runBench()); }
