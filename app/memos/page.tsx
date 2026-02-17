/**
 * Library Page: 
 * Displays the full list of saved memos with search, filter, and delete options.
 */
 
"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/browser"
import { Navbar } from "@/components/ui/navbar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useMemos } from "@/app/context/MemoContext"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calendar, Search, Filter, MoreVertical, Trash2, Mic, Folder } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DotGridBackground } from "@/components/ui/dot-grid-background"

export default function MemosPage() {
  const { memos, deleteMemo } = useMemos()

  const router = useRouter()
  const supabase = createClient()
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([])
  const [foldersLoaded, setFoldersLoaded] = useState(false)

  const [filteredMemos, setFilteredMemos] = useState(memos)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")

  const categories = [
    "all",
    ...Array.from(
      new Set([
        "Unsorted",
        ...folders.map((f) => f.name),
        ...memos.map((m) => m.category).filter(Boolean) as string[],
      ])
    ),
  ]

  useEffect(() => {
    let mounted = true

    ;(async () => {
      const { data, error } = await supabase.auth.getUser()
      const user = data?.user

      if (!user || error) {
        router.replace("/login")
        return
      }

      const { data: folderRows } = await supabase
        .from("folders")
        .select("id,name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })

      if (!mounted) return
      setFolders((folderRows ?? []) as Array<{ id: string; name: string }>)
      setFoldersLoaded(true)
    })()

    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let filtered = [...memos]
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter((m) => {
        const inTitle = m.title.toLowerCase().includes(q)
        const inTranscript = (m.transcription ?? "").toLowerCase().includes(q)
        return inTitle || inTranscript
      })
    }
    if (selectedCategory !== "all") {
      filtered = filtered.filter((m) => m.category === selectedCategory)
    }
    setFilteredMemos(filtered)
  }, [searchQuery, selectedCategory, memos])

  useEffect(() => {
    if (!foldersLoaded) return
    if (selectedCategory === "all") return
    const allowed = new Set(categories)
    if (!allowed.has(selectedCategory)) {
      setSelectedCategory("all")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foldersLoaded, folders, memos])

  return (
    <div className="relative min-h-screen bg-background">
      <DotGridBackground />
      <Navbar />
      <main className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-6">
            <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">
              All Memos
            </h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Folder className="size-4" />
              <p className="text-sm">
                {filteredMemos.length} memo{filteredMemos.length !== 1 ? "s" : ""} found
              </p>
              {searchQuery && (
                <Badge variant="secondary" className="ml-2">
                  Searching: "{searchQuery}"
                </Badge>
              )}
              {selectedCategory !== "all" && (
                <Badge variant="secondary" className="ml-2">
                  Folder: {selectedCategory}
                </Badge>
              )}
            </div>
            {!foldersLoaded && (
              <p className="text-xs text-muted-foreground mt-2 animate-pulse">
                Loading your folders…
              </p>
            )}
          </div>

          {/* Search and Filter */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search memos by title or content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 rounded-xl border-border bg-secondary/40"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full md:w-[220px] h-12 rounded-xl border-border bg-secondary/40">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Folders" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat!}>
                    {cat === "all" ? "All Folders" : cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Memos Grid */}
        {filteredMemos.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-border bg-secondary/20 p-12 text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-muted">
              <Search className="size-8 text-muted-foreground" />
            </div>
            <p className="text-base font-medium text-foreground mb-1">
              No memos found
            </p>
            <p className="text-sm text-muted-foreground">
              {searchQuery || selectedCategory !== "all"
                ? "Try clearing your filters or adjusting your search"
                : "Start recording to create your first memo"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMemos.map((memo) => (
              <Card
                key={memo.id}
                className="group border-2 border-border bg-secondary/20 transition-all hover:border-accent/50 hover:bg-secondary/40"
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/20">
                          <Mic className="size-4 text-accent" />
                        </div>
                        <CardTitle className="text-base truncate">
                          {memo.title}
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="size-3" />
                        <span>{memo.date}</span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => deleteMemo(memo.id)}
                        >
                          <Trash2 className="size-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Badge
                    variant="outline"
                    className="text-xs font-medium border-accent/50 text-accent"
                  >
                    {memo.category || "Unsorted"}
                  </Badge>

                  {memo.transcription && (
                    <div className="rounded-lg border border-border bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                        {memo.transcription}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}