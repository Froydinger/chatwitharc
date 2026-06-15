import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, ChevronDown, ChevronUp, Sparkles, Loader2 } from "lucide-react";

import { usePersonasStore, type Persona } from "@/store/usePersonasStore";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface PersonasManagerProps {
  onSelectPersona?: (persona: Persona) => void;
}

export function PersonasManager({ onSelectPersona }: PersonasManagerProps) {
  const { personas, loading, fetchPersonas, createPersona, updatePersona, deletePersona, generateAvatar } = usePersonasStore();
  const [generatingAvatarId, setGeneratingAvatarId] = useState<string | null>(null);

  const { toast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSystemPrompt, setNewSystemPrompt] = useState("");

  useEffect(() => {
    fetchPersonas();
  }, [fetchPersonas]);

  const handleCreate = async () => {
    if (!newName.trim() || !newSystemPrompt.trim()) {
      toast({
        title: "Missing fields",
        description: "Name and system prompt are required.",
        variant: "destructive",
      });
      return;
    }

    try {
      await createPersona(newName, newSystemPrompt, newDescription || undefined);
      setNewName("");
      setNewDescription("");
      setNewSystemPrompt("");
      setShowNewForm(false);
      toast({
        title: "Persona created",
        description: `"${newName}" is ready to use.`,
      });
    } catch (err) {
      toast({
        title: "Failed to create persona",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await deletePersona(id);
      toast({
        title: "Persona deleted",
        description: `"${name}" has been removed.`,
      });
    } catch (err) {
      toast({
        title: "Failed to delete",
        variant: "destructive",
      });
    }
  };

  const handleSelect = (persona: Persona) => {
    if (onSelectPersona) {
      onSelectPersona(persona);
    }
  };

  if (loading && personas.length === 0) {
    return <div className="text-sm text-muted-foreground">Loading personas...</div>;
  }

  return (
    <div className="space-y-3">
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Custom Personas</h3>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> New
        </button>
      </div>

      {/* New persona form */}
      {showNewForm && (
        <div className="p-3 rounded-lg border border-border/50 bg-muted/30 space-y-3">
          <input
            type="text"
            placeholder="Persona name (e.g., 'Code Expert')"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="text"
            placeholder="Brief description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <textarea
            placeholder="System prompt (how this persona should behave)"
            value={newSystemPrompt}
            onChange={(e) => setNewSystemPrompt(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-24 resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowNewForm(false)}
              className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* List of personas */}
      {personas.length === 0 && !showNewForm ? (
        <div className="text-xs text-muted-foreground text-center py-4">
          No personas yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {personas.map((persona) => (
            <div
              key={persona.id}
              className="border border-border/50 rounded-lg bg-muted/20 overflow-hidden"
            >
              <button
                onClick={() => setExpanded(expanded === persona.id ? null : persona.id)}
                className="w-full flex items-center justify-between p-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 text-left min-w-0">
                  {persona.avatarUrl ? (
                    <img
                      src={persona.avatarUrl}
                      alt={persona.name}
                      className="h-10 w-10 rounded-full object-cover bg-white shrink-0 border border-border/50"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold shrink-0">
                      {persona.name[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {persona.name}
                    </div>
                    {persona.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {persona.description}
                      </div>
                    )}
                  </div>
                </div>
                {expanded === persona.id ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {expanded === persona.id && (
                <div className="px-3 pb-3 pt-1 border-t border-border/30 space-y-3">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">System Prompt</div>
                    <div className="text-xs bg-background/60 p-2.5 rounded border border-border/50 text-foreground/80 max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {persona.systemPrompt}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSelect(persona)}
                      className="flex-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      Use in chat
                    </button>
                    {!persona.id.startsWith('builtin-') && (
                      <button
                        onClick={async () => {
                          setGeneratingAvatarId(persona.id);
                          try {
                            await generateAvatar(persona.id);
                            toast({ title: 'Avatar generated', description: `New avatar for "${persona.name}".` });
                          } catch (err: any) {
                            toast({ title: 'Avatar failed', description: err?.message || 'Try again', variant: 'destructive' });
                          } finally {
                            setGeneratingAvatarId(null);
                          }
                        }}
                        disabled={generatingAvatarId === persona.id}
                        className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                        title="Generate avatar with AI"
                      >
                        {generatingAvatarId === persona.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {persona.avatarUrl ? 'Regenerate' : 'Avatar'}
                      </button>
                    )}
                    {!persona.id.startsWith('builtin-') && (
                      <button
                        onClick={() => handleDelete(persona.id, persona.name)}
                        className="p-1.5 rounded-md text-xs text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}

            </div>
          ))}
        </div>
      )}
    </div>
  );
}
