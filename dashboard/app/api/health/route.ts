/**
 * Health Check API Route
 * Tests MongoDB connection and returns system status
 */

import { NextResponse } from "next/server";
import { checkConnection } from "@/lib/mongodb";

export async function GET() {
  try {
    // Check MongoDB connection
    const isConnected = await checkConnection();

    if (!isConnected) {
      return NextResponse.json(
        {
          status: "error",
          message: "MongoDB connection failed",
          mongodb: false,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      status: "ok",
      message: "All systems operational",
      mongodb: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check error:", error);

    return NextResponse.json(
      {
        status: "error",
        message: "Internal server error",
        mongodb: false,
      },
      { status: 500 }
    );
  }
}
