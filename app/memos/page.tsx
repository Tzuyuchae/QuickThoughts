"use client";

import { useState, useRef, useEffect } from "react";
import { Navbar } from "@/components/ui/navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Play,
  Pause,
  Calendar,
  Search,
  Filter,
  SortAsc,
  Trash2,
  Edit,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type MemoStatus = "ready" | "classifying" | "error";

type Memo = {
  id: string;
  title: string;
  status: MemoStatus;
  date: string;
  audioUrl?: string;
  duration?: number;
  category?: string;
  transcription?: string;
};

export default function MemosPage() {
  // Sample memos data - Replace with actual Supabase data
  const [memos, setMemos] = useState<Memo[]>([
    {
      id: "1",
      title: "Morning thoughts about project planning",
      status: "ready",
      date: "2026-01-28",
      category: "Work",
      transcription: "Need to organize the team meeting for next week...",
      duration: 45,
    },
    {
      id: "2",
      title: "Grocery list for the week",
      status: "ready",
      date: "2026-01-27",
      category: "Shopping",
      transcription: "Milk, eggs, bread, chicken, vegetables...",
      duration: 30,
    },
    {
      id: "3",
      title: "Workout routine ideas",
      status: "classifying",
      date: "2026-01-27",
      category: "Health",
      duration: 60,
    },
    {
      id: "4",
      title: "Book ideas for novel",
      status: "ready",
      date: "2026-01-26",
      category: "Ideas",
      transcription: "Character development for the protagonist...",
      duration: 120,
    },
    {
      id: "5",
      title: "Budget review notes",
      status: "ready",
      date: "2026-01-25",
      category: "Finance",
      transcription: "Monthly expenses are higher than expected...",
      duration: 90,
    },
    {
      id: "6",
      title: "Personal reflection",
      status: "ready",
      date: "2026-01-25",
      category: "Personal",
      transcription: "Feeling grateful for the progress made this month...",
      duration: 75,
    },
    {
      id: "7",
      title: "Meeting notes with client",
      status: "ready",
      date: "2026-01-24",
      category: "Work",
      transcription: "Client requested changes to the design...",
      duration: 180,
    },
    {
      id: "8",
      title: "Weekend plans",
      status: "ready",
      date: "2026-01-23",
      category: "Personal",
      transcription: "Planning to visit the museum on Saturday...",
      duration: 40,
    },
  ]);

  const [filteredMemos, setFilteredMemos] = useState<Memo[]>(memos);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState("date-desc");

  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const [playbackSpeeds, setPlaybackSpeeds] = useState<Record<string, number>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentTimes, setCurrentTimes] = useState<Record<string, number>>({});

  // Get unique categories
  const categories = ["all", ...Array.from(new Set(memos.map((m) => m.category).filter((c): c is string => Boolean(c))))];

  // Filter and sort memos
  useEffect(() => {
    let filtered = [...memos];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (memo) =>
          memo.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          memo.transcription?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply category filter
    if (selectedCategory !== "all") {
      filtered = filtered.filter((memo) => memo.category === selectedCategory);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "date-desc":
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case "date-asc":
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case "title-asc":
          return a.title.localeCompare(b.title);
        case "title-desc":
          return b.title.localeCompare(a.title);
        case "duration-desc":
          return (b.duration || 0) - (a.duration || 0);
        case "duration-asc":
          return (a.duration || 0) - (b.duration || 0);
        default:
          return 0;
      }
    });

    setFilteredMemos(filtered);
  }, [searchQuery, selectedCategory, sortBy, memos]);

  const togglePlay = (id: string) => {
    const audio = audioRefs.current[id];
    if (!audio) return;

    if (playingId && playingId !== id) {
      const prevAudio = audioRefs.current[playingId];
      if (prevAudio) {
        prevAudio.pause();
      }
    }

    if (audio.paused) {
      audio.play().catch((err) => {
        console.error("Error playing audio:", err);
      });
      setPlayingId(id);
    } else {
      audio.pause();
      setPlayingId(null);
    }
  };

  const toggleSpeed = (id: string) => {
    const audio = audioRefs.current[id];
    if (!audio) return;

    const current = playbackSpeeds[id] || 1;
    const newSpeed = current === 1 ? 1.5 : current === 1.5 ? 2 : 1;
    setPlaybackSpeeds((prev) => ({ ...prev, [id]: newSpeed }));
    audio.playbackRate = newSpeed;
  };

  const handleAudioEnded = (id: string) => {
    if (playingId === id) {
      setPlayingId(null);
    }
  };

  const handleTimeUpdate = (id: string, currentTime: number) => {
    setCurrentTimes((prev) => ({ ...prev, [id]: currentTime }));
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
  };

  const getCategoryColor = (category?: string) => {
    switch (category) {
      case "Work":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "Personal":
        return "bg-purple-500/10 text-purple-600 border-purple-500/20";
      case "Tasks":
        return "bg-green-500/10 text-green-600 border-green-500/20";
      case "Shopping":
        return "bg-orange-500/10 text-orange-600 border-orange-500/20";
      case "Health":
        return "bg-red-500/10 text-red-600 border-red-500/20";
      case "Finance":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "Ideas":
        return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
      default:
        return "bg-gray-500/10 text-gray-600 border-gray-500/20";
    }
  };

  const handleDeleteMemo = (id: string) => {
    // TODO: Implement delete with confirmation
    console.log("Delete memo:", id);
  };

  const handleEditMemo = (id: string) => {
    // TODO: Implement edit functionality
    console.log("Edit memo:", id);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">All Memos</h1>
          <p className="text-muted-foreground">
            {filteredMemos.length} {filteredMemos.length === 1 ? "memo" : "memos"} found
          </p>
        </div>

        {/* Filters and Search */}
        <div className="mb-6 flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search memos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Category Filter */}
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full md:w-[200px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category === "all" ? "All Categories" : category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full md:w-[200px]">
              <SortAsc className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date-desc">Newest First</SelectItem>
              <SelectItem value="date-asc">Oldest First</SelectItem>
              <SelectItem value="title-asc">Title (A-Z)</SelectItem>
              <SelectItem value="title-desc">Title (Z-A)</SelectItem>
              <SelectItem value="duration-desc">Longest First</SelectItem>
              <SelectItem value="duration-asc">Shortest First</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Memos Grid */}
        {filteredMemos.length === 0 ? (
          <Card className="border-2">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-muted w-16 h-16 flex items-center justify-center mb-4">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No memos found</h3>
              <p className="text-sm text-muted-foreground text-center">
                {searchQuery || selectedCategory !== "all"
                  ? "Try adjusting your filters or search query"
                  : "Start by recording your first memo"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMemos.map((memo) => (
              <Card
                key={memo.id}
                className="group border-2 hover:border-primary/50 transition-all duration-300 hover:shadow-lg"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base line-clamp-2 mb-2">
                        {memo.title}
                      </CardTitle>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDate(memo.date)}
                        </div>
                        {memo.duration && (
                          <span className="text-xs text-muted-foreground">
                            • {formatTime(memo.duration)}
                          </span>
                        )}
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditMemo(memo.id)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteMemo(memo.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Category and Status */}
                  <div className="flex items-center gap-2">
                    {memo.category && (
                      <Badge
                        variant="outline"
                        className={`text-xs ${getCategoryColor(memo.category)}`}
                      >
                        {memo.category}
                      </Badge>
                    )}
                    <Badge
                      variant={memo.status === "ready" ? "default" : "secondary"}
                      className="text-xs capitalize"
                    >
                      {memo.status}
                    </Badge>
                  </div>

                  {/* Transcription Preview */}
                  {memo.transcription && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {memo.transcription}
                    </p>
                  )}

                  {/* Audio Player */}
                  {memo.audioUrl && (
                    <div className="pt-2 border-t">
                      <audio
                        ref={(el) => {
                          audioRefs.current[memo.id] = el;
                          if (el) {
                            el.playbackRate = playbackSpeeds[memo.id] || 1;
                          }
                        }}
                        src={memo.audioUrl}
                        onEnded={() => handleAudioEnded(memo.id)}
                        onTimeUpdate={(e) =>
                          handleTimeUpdate(memo.id, e.currentTarget.currentTime)
                        }
                        onLoadedMetadata={(e) => {
                          const duration = e.currentTarget.duration;
                          setMemos((prev) =>
                            prev.map((m) =>
                              m.id === memo.id ? { ...m, duration } : m
                            )
                          );
                        }}
                        style={{ display: "none" }}
                      />

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => togglePlay(memo.id)}
                          className="transition-all hover:scale-105"
                        >
                          {playingId === memo.id ? (
                            <Pause className="h-3 w-3 mr-1" />
                          ) : (
                            <Play className="h-3 w-3 mr-1" />
                          )}
                          {playingId === memo.id ? "Pause" : "Play"}
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleSpeed(memo.id)}
                          className="font-mono text-xs"
                        >
                          {playbackSpeeds[memo.id] || 1}x
                        </Button>

                        <span className="text-xs text-muted-foreground ml-auto font-mono">
                          {formatTime(currentTimes[memo.id] || 0)}
                          {memo.duration && ` / ${formatTime(memo.duration)}`}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}