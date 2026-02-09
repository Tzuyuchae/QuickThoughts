"use client";
import { useState } from "react";

export default function GeminiTest() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  const sendPrompt = async () => {
    setLoading(true); // 🔴 will underline in UI
    setResponse("");  // 🔴 will underline in UI

    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    const text = await res.text();

    try {
      const data = JSON.parse(text);

      if (!res.ok) {
        setResponse(data.error || "Something went wrong");
      } else {
        setResponse(data.response);
      }
    } catch {
      setResponse("Server returned invalid response");
    }

    setLoading(false); // 🔴 will underline in UI
  };

  return (
    <div className="p-6">
      <h2>Gemini Test</h2>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Ask Gemini something..."
        rows={4}
        className="w-full border p-2 mb-2"
      />

      <button
        onClick={sendPrompt}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        {loading ? "Thinking..." : "Send"}
      </button>

      {/* Red underline for state values */}
      <div className="mt-4">
        <p className="border-b-2 border-red-600 pb-1">
          Response: {response}
        </p>
        <p className="border-b-2 border-red-600 pb-1">
          Loading: {loading.toString()}
        </p>
      </div>
    </div>
  );
}
