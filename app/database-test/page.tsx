

"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function DatabaseTestPage() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function testDatabase() {
    setLoading(true);
    setMessage("Testing database...");

    try {
      const supabase = createClient();

      // Get the currently signed-in user
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError) throw userError;
      if (!userData.user) throw new Error("Please sign in first.");

      // Create a temporary test record
      const { data: newItem, error: insertError } = await supabase
        .from("life_items")
        .insert({
          user_id: userData.user.id,
          item_type: "task",
          title: "LifePilot connection test",
          completed: false,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Delete the temporary test record
      const { error: deleteError } = await supabase
        .from("life_items")
        .delete()
        .eq("id", newItem.id);

      if (deleteError) {
        throw new Error(
          "The test record was created, but cleanup failed. Please check your Supabase table."
        );
      }

      setMessage(
        "Success! LifePilot can create and delete records in Supabase."
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Database test failed."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-lg">
        <h1 className="mb-4 text-3xl font-bold text-violet-700">
          LifePilot ✨
        </h1>

        <h2 className="mb-5 text-xl font-semibold">
          Online database test
        </h2>

        <button
          onClick={testDatabase}
          disabled={loading}
          className="w-full rounded-xl bg-violet-600 p-4 font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Testing..." : "Test database saving"}
        </button>

        {message && (
          <p className="mt-5 rounded-xl bg-violet-50 p-4 text-slate-700">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}

