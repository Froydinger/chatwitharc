export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          is_primary_admin: boolean | null
          role: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          is_primary_admin?: boolean | null
          role?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          is_primary_admin?: boolean | null
          role?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chat_sessions: {
        Row: {
          canvas_content: string | null
          created_at: string | null
          id: string
          messages: Json | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          canvas_content?: string | null
          created_at?: string | null
          id?: string
          messages?: Json | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          canvas_content?: string | null
          created_at?: string | null
          id?: string
          messages?: Json | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      generated_files: {
        Row: {
          created_at: string | null
          downloaded_count: number | null
          file_name: string
          file_size: number | null
          file_type: string
          file_url: string
          id: string
          mime_type: string | null
          prompt: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          downloaded_count?: number | null
          file_name: string
          file_size?: number | null
          file_type: string
          file_url: string
          id?: string
          mime_type?: string | null
          prompt?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          downloaded_count?: number | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          file_url?: string
          id?: string
          mime_type?: string | null
          prompt?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          accent_color: string | null
          avatar_url: string | null
          context_info: string | null
          created_at: string | null
          display_name: string | null
          id: string
          memory_info: string | null
          preferred_model: string | null
          preferred_voice: string | null
          research_model: string | null
          theme_preference: string | null
          updated_at: string | null
          user_id: string
          welcome_email_sent: boolean | null
        }
        Insert: {
          accent_color?: string | null
          avatar_url?: string | null
          context_info?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          memory_info?: string | null
          preferred_model?: string | null
          preferred_voice?: string | null
          research_model?: string | null
          theme_preference?: string | null
          updated_at?: string | null
          user_id: string
          welcome_email_sent?: boolean | null
        }
        Update: {
          accent_color?: string | null
          avatar_url?: string | null
          context_info?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          memory_info?: string | null
          preferred_model?: string | null
          preferred_voice?: string | null
          research_model?: string | null
          theme_preference?: string | null
          updated_at?: string | null
          user_id?: string
          welcome_email_sent?: boolean | null
        }
        Relationships: []
      }
      saved_links: {
        Row: {
          created_at: string
          id: string
          list_id: string
          list_name: string
          saved_at: string
          snippet: string | null
          title: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          list_id?: string
          list_name?: string
          saved_at?: string
          snippet?: string | null
          title: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          list_id?: string
          list_name?: string
          saved_at?: string
          snippet?: string | null
          title?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      search_sessions: {
        Row: {
          created_at: string
          formatted_content: string | null
          id: string
          query: string
          related_queries: Json | null
          results: Json | null
          source_conversations: Json | null
          summary_conversation: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          formatted_content?: string | null
          id?: string
          query: string
          related_queries?: Json | null
          results?: Json | null
          source_conversations?: Json | null
          summary_conversation?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          formatted_content?: string | null
          id?: string
          query?: string
          related_queries?: Json | null
          results?: Json | null
          source_conversations?: Json | null
          summary_conversation?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin_user: { Args: never; Returns: boolean }
      list_chat_sessions_meta: {
        Args: { max_sessions?: number; searching_user_id: string }
        Returns: {
          canvas_content: string
          created_at: string
          id: string
          message_count: number
          title: string
          updated_at: string
        }[]
      }
      search_chat_sessions: {
        Args: {
          max_sessions?: number
          search_query: string
          searching_user_id: string
        }
        Returns: {
          id: string
          messages: Json
          title: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
