/**
 * Library Page: 
 * Displays the full list of saved memos with search, filter, and delete options.
 */
 
"use client";


import { useState, useRef, useEffect } from "react";
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
  Play, Pause, Calendar, Search, Filter, MoreVertical, Trash2, FileAudio, Mic
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function MemosPage() {
  const { memos, deleteMemo } = useMemos();

  const [filteredMemos, setFilteredMemos] = useState(memos);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);

  const categories = ["all", ...Array.from(new Set(memos.map((m) => m.category).filter(Boolean)))];

  useEffect(() => {
    let filtered = [...memos];
    if (searchQuery) {
      filtered = filtered.filter(m => m.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (selectedCategory !== "all") {
      filtered = filtered.filter(m => m.category === selectedCategory);
    }
    setFilteredMemos(filtered);
  }, [searchQuery, selectedCategory, memos]);

  const togglePlay = (id: string) => {
    const audio = audioRefs.current[id];
    if (!audio) return;
    if (playingId && playingId !== id) audioRefs.current[playingId]?.pause();
    if (audio.paused) {
      audio.play();
      setPlayingId(id);
    } else {
      audio.pause();
      setPlayingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold mb-2">All Memos</h1>
            <p className="text-muted-foreground">{filteredMemos.length} memos found</p>
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
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat!}>{cat === "all" ? "All Categories" : cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMemos.map((memo) => (
            <Card key={memo.id} className="border-2 group">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {memo.category === "Upload" ? <FileAudio className="h-4 w-4 text-primary" /> : <Mic className="h-4 w-4 text-primary" />}
                      <CardTitle className="text-base truncate max-w-[180px]">{memo.title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" /> {memo.date}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-destructive" onClick={() => deleteMemo(memo.id)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                {memo.audioUrl ? (
                  <>
                    <audio ref={el => { audioRefs.current[memo.id] = el; }} src={memo.audioUrl} onEnded={() => setPlayingId(null)} hidden />
                    <Button variant="outline" size="sm" onClick={() => togglePlay(memo.id)}>
                      {playingId === memo.id ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                      {playingId === memo.id ? "Pause" : "Play"}
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No audio for example.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}