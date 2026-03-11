/**
 * Library Page: 
 * Displays the full list of saved memos with search, filter, and delete options.
 */
 
"use client"

import { useState, useEffect, useMemo } from "react"
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
import { Calendar, Search, Filter, MoreVertical, Trash2, Mic, Folder, Pencil, Plus } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DotGridBackground } from "@/components/ui/dot-grid-background"

export default function MemosPage() {
  const { memos, deleteMemo, updateMemo } = useMemos()

  const router = useRouter()
  const supabase = createClient()
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([])
  const [foldersLoaded, setFoldersLoaded] = useState(false)

  const [filteredMemos, setFilteredMemos] = useState(memos)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editFolder, setEditFolder] = useState("Unsorted")
  const [editTranscription, setEditTranscription] = useState("")

  const [newFolderName, setNewFolderName] = useState("")
  const [folderActionLoading, setFolderActionLoading] = useState(false)
  const [folderMessage, setFolderMessage] = useState<string | null>(null)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState("")

  const categories = useMemo(
    () => [
      "all",
      ...Array.from(
        new Set([
          "Unsorted",
          ...folders.map((f) => f.name),
          ...(memos.map((m) => m.category).filter(Boolean) as string[]),
        ])
      ),
    ],
    [folders, memos]
  )
  async function createFolder() {
    const trimmed = newFolderName.trim()
    if (!trimmed) {
      setFolderMessage("Enter a folder name first.")
      return
    }

    const alreadyExists = folders.some(
      (folder) => folder.name.toLowerCase() === trimmed.toLowerCase()
    )
    if (alreadyExists || trimmed.toLowerCase() === "unsorted") {
      setFolderMessage("That folder name already exists.")
      return
    }

    setFolderActionLoading(true)
    setFolderMessage(null)

    const { data, error } = await supabase.auth.getUser()
    const user = data?.user

    if (!user || error) {
      setFolderActionLoading(false)
      setFolderMessage("You must be logged in to create a folder.")
      return
    }

    const { data: inserted, error: insertError } = await supabase
      .from("folders")
      .insert({
        user_id: user.id,
        name: trimmed,
      })
      .select("id,name")
      .single()

    setFolderActionLoading(false)

    if (insertError || !inserted) {
      setFolderMessage("Could not create folder.")
      return
    }

    setFolders((prev) => [...prev, inserted as { id: string; name: string }])
    setNewFolderName("")
    setFolderMessage(`Created folder \"${trimmed}\".`)
  }

  async function saveFolderRename() {
    const trimmed = editingFolderName.trim()
    if (!editingFolderId) return

    if (!trimmed) {
      setFolderMessage("Folder name cannot be empty.")
      return
    }

    const duplicate = folders.some(
      (folder) =>
        folder.id !== editingFolderId &&
        folder.name.toLowerCase() === trimmed.toLowerCase()
    )
    if (duplicate || trimmed.toLowerCase() === "unsorted") {
      setFolderMessage("That folder name already exists.")
      return
    }

    setFolderActionLoading(true)
    setFolderMessage(null)

    const originalFolder = folders.find((folder) => folder.id === editingFolderId)

    const { error } = await supabase
      .from("folders")
      .update({ name: trimmed })
      .eq("id", editingFolderId)

    setFolderActionLoading(false)

    if (error) {
      setFolderMessage("Could not rename folder.")
      return
    }

    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === editingFolderId ? { ...folder, name: trimmed } : folder
      )
    )

    if (selectedCategory === originalFolder?.name) {
      setSelectedCategory(trimmed)
    }

    if (editFolder === originalFolder?.name) {
      setEditFolder(trimmed)
    }

    setEditingFolderId(null)
    setEditingFolderName("")
    setFolderMessage("Folder renamed.")
  }

  async function deleteFolder(folderId: string, folderName: string) {
    if (!window.confirm(`Delete folder \"${folderName}\"? Memos inside it will be moved to Unsorted.`)) {
      return
    }

    setFolderActionLoading(true)
    setFolderMessage(null)

    const { data, error } = await supabase.auth.getUser()
    const user = data?.user

    if (!user || error) {
      setFolderActionLoading(false)
      setFolderMessage("You must be logged in to delete a folder.")
      return
    }

    const { error: memoUpdateError } = await supabase
      .from("memos")
      .update({ folder_id: null })
      .eq("user_id", user.id)
      .eq("folder_id", folderId)

    if (memoUpdateError) {
      setFolderActionLoading(false)
      setFolderMessage("Could not move memos out of that folder.")
      return
    }

    const { error: deleteError } = await supabase
      .from("folders")
      .delete()
      .eq("id", folderId)

    setFolderActionLoading(false)

    if (deleteError) {
      setFolderMessage("Could not delete folder.")
      return
    }

    setFolders((prev) => prev.filter((folder) => folder.id !== folderId))

    if (selectedCategory === folderName) {
      setSelectedCategory("all")
    }

    if (editFolder === folderName) {
      setEditFolder("Unsorted")
    }

    setFolderMessage("Folder deleted. Memos from that folder are now Unsorted.")
  }

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
                  Searching: &ldquo;{searchQuery}&rdquo;
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

          <div className="mb-6 rounded-2xl border border-border bg-secondary/20 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Folder className="size-4 text-accent" />
              <h2 className="text-sm font-semibold text-foreground">Manage folders</h2>
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <Input
                placeholder="New folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="h-10 rounded-xl border-border bg-secondary/40"
              />
              <Button
                type="button"
                className="rounded-xl"
                disabled={folderActionLoading}
                onClick={createFolder}
              >
                <Plus className="size-4 mr-2" />
                Add Folder
              </Button>
            </div>

            {folderMessage && (
              <p className="text-xs text-muted-foreground">{folderMessage}</p>
            )}

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-full px-3 py-1 border-accent/40 text-accent">
                Unsorted
              </Badge>
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="flex items-center gap-2 rounded-full border border-border bg-background/50 px-3 py-1.5"
                >
                  {editingFolderId === folder.id ? (
                    <>
                      <Input
                        value={editingFolderName}
                        onChange={(e) => setEditingFolderName(e.target.value)}
                        className="h-8 w-[150px]"
                      />
                      <Button
                        size="sm"
                        className="h-8 rounded-full px-3"
                        disabled={folderActionLoading}
                        onClick={saveFolderRename}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 rounded-full px-3"
                        onClick={() => {
                          setEditingFolderId(null)
                          setEditingFolderName("")
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-foreground">{folder.name}</span>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-full p-1 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditingFolderId(folder.id)
                          setEditingFolderName(folder.name)
                          setFolderMessage(null)
                        }}
                        aria-label={`Rename ${folder.name}`}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-full p-1 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteFolder(folder.id, folder.name)}
                        aria-label={`Delete ${folder.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
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
                        {editingId === memo.id ? (
                          <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="h-9"
                          />
                        ) : (
                          <CardTitle className="text-base truncate">
                            {memo.title}
                          </CardTitle>
                        )}
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
                          onClick={() => {
                            setEditingId(memo.id)
                            setEditTitle(memo.title)
                            setEditFolder(memo.category || "Unsorted")
                            setEditTranscription(memo.transcription || "")
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
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
                  {editingId === memo.id ? (
                    <div className="space-y-2">
                      <Select value={editFolder} onValueChange={setEditFolder}>
                        <SelectTrigger className="h-10 rounded-xl border-border bg-secondary/40">
                          <SelectValue placeholder="Select folder" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Unsorted">Unsorted</SelectItem>
                          {folders.map((f) => (
                            <SelectItem key={f.id} value={f.name}>
                              {f.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Memo</p>
                        <textarea
                          value={editTranscription}
                          onChange={(e) => setEditTranscription(e.target.value)}
                          placeholder="Edit memo text…"
                          className="min-h-[120px] w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="rounded-xl"
                          onClick={() => {
                            updateMemo(memo.id, {
                              title: editTitle.trim() || "Voice Memo",
                              category: editFolder,
                              transcription: editTranscription,
                              content: editTranscription,
                            })
                            setEditingId(null)
                            setEditTranscription("")
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="rounded-xl"
                          onClick={() => {
                            setEditingId(null)
                            setEditTitle("")
                            setEditFolder("Unsorted")
                            setEditTranscription("")
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-xs font-medium border-accent/50 text-accent"
                    >
                      {memo.category || "Unsorted"}
                    </Badge>
                  )}

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