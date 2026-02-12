/**
 * Library Page: 
 * Displays the full list of saved memos with search, filter, and delete options.
 */
 
"use client";


import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Navbar } from "@/components/ui/navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useMemos } from "@/app/context/MemoContext";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Calendar, Search, Filter, MoreVertical, Trash2, Mic
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function MemosPage() {
  const { memos, deleteMemo } = useMemos();

  const router = useRouter();
  const supabase = createClient();
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [foldersLoaded, setFoldersLoaded] = useState(false);

  const [filteredMemos, setFilteredMemos] = useState(memos);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const categories = [
    "all",
    ...Array.from(
      new Set([
        "Unsorted",
        ...folders.map((f) => f.name),
        ...memos.map((m) => m.category).filter(Boolean) as string[],
      ])
    ),
  ];

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data, error } = await supabase.auth.getUser();
      const user = data?.user;

      if (!user || error) {
        router.replace("/login");
        return;
      }

      const { data: folderRows } = await supabase
        .from("folders")
        .select("id,name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (!mounted) return;
      setFolders((folderRows ?? []) as Array<{ id: string; name: string }>);
      setFoldersLoaded(true);
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let filtered = [...memos];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((m) => {
        const inTitle = m.title.toLowerCase().includes(q);
        const inTranscript = (m.transcription ?? "").toLowerCase().includes(q);
        return inTitle || inTranscript;
      });
    }
    if (selectedCategory !== "all") {
      filtered = filtered.filter(m => m.category === selectedCategory);
    }
    setFilteredMemos(filtered);
  }, [searchQuery, selectedCategory, memos]);

  useEffect(() => {
    if (!foldersLoaded) return;
    if (selectedCategory === "all") return;
    const allowed = new Set(categories);
    if (!allowed.has(selectedCategory)) {
      setSelectedCategory("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foldersLoaded, folders, memos]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold mb-2">All Memos</h1>
            <p className="text-muted-foreground">{filteredMemos.length} memos found</p>
            {!foldersLoaded && (
              <p className="text-xs text-muted-foreground mt-1">Loading your folders…</p>
            )}
          </div>
        </div>

        <div className="mb-6 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search memos..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              className="pl-10" 
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full md:w-[200px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Folders" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat!}>{cat === "all" ? "All Folders" : cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filteredMemos.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
            <p className="text-sm font-medium">No memos match your filters.</p>
            <p className="text-xs mt-1">Try clearing the search or choosing a different folder.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMemos.map((memo) => (
              <Card key={memo.id} className="border-2 group">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Mic className="h-4 w-4 text-primary flex-shrink-0" />
                      <CardTitle className="text-base truncate">{memo.title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" /> {memo.date}
                    </div>
                    <div className="pt-1">
                      <Badge variant="outline" className="text-[10px]">
                        {memo.category || "Unsorted"}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-destructive" onClick={() => deleteMemo(memo.id)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {memo.transcription && (
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                    <p className="line-clamp-3">{memo.transcription}</p>
                  </div>
                )}
                
                {/* Audio playback removed – memos are text-only */}
              </CardContent>
            </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}