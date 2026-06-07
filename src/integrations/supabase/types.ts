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
      chat_folders: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      chat_sessions: {
        Row: {
          canvas_content: string | null
          created_at: string | null
          folder_id: string | null
          id: string
          is_public: boolean
          messages: Json | null
          persona_id: string | null
          shared_at: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          canvas_content?: string | null
          created_at?: string | null
          folder_id?: string | null
          id?: string
          is_public?: boolean
          messages?: Json | null
          persona_id?: string | null
          shared_at?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          canvas_content?: string | null
          created_at?: string | null
          folder_id?: string | null
          id?: string
          is_public?: boolean
          messages?: Json | null
          persona_id?: string | null
          shared_at?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "chat_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      comped_users: {
        Row: {
          created_at: string
          email: string
          id: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      context_blocks: {
        Row: {
          content: string
          created_at: string
          id: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
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
      ide_projects: {
        Row: {
          created_at: string
          favicon_label: string | null
          files: Json
          id: string
          messages: Json
          netlify_site_id: string | null
          netlify_subdomain: string | null
          netlify_url: string | null
          prompt: string
          title: string
          updated_at: string
          user_id: string
          version: number
          versions: Json
        }
        Insert: {
          created_at?: string
          favicon_label?: string | null
          files?: Json
          id?: string
          messages?: Json
          netlify_site_id?: string | null
          netlify_subdomain?: string | null
          netlify_url?: string | null
          prompt?: string
          title?: string
          updated_at?: string
          user_id: string
          version?: number
          versions?: Json
        }
        Update: {
          created_at?: string
          favicon_label?: string | null
          files?: Json
          id?: string
          messages?: Json
          netlify_site_id?: string | null
          netlify_subdomain?: string | null
          netlify_url?: string | null
          prompt?: string
          title?: string
          updated_at?: string
          user_id?: string
          version?: number
          versions?: Json
        }
        Relationships: []
      }
      image_generation_jobs: {
        Row: {
          aspect_ratio: string | null
          attempts: number | null
          base_image_urls: string[] | null
          created_at: string
          error_message: string | null
          error_type: string | null
          id: string
          job_type: string
          last_attempt_at: string | null
          preferred_model: string | null
          prompt: string
          result_image_url: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          aspect_ratio?: string | null
          attempts?: number | null
          base_image_urls?: string[] | null
          created_at?: string
          error_message?: string | null
          error_type?: string | null
          id?: string
          job_type: string
          last_attempt_at?: string | null
          preferred_model?: string | null
          prompt: string
          result_image_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          aspect_ratio?: string | null
          attempts?: number | null
          base_image_urls?: string[] | null
          created_at?: string
          error_message?: string | null
          error_type?: string | null
          id?: string
          job_type?: string
          last_attempt_at?: string | null
          preferred_model?: string | null
          prompt?: string
          result_image_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      personas: {
        Row: {
          created_at: string
          default_model_family: string
          description: string | null
          emoji: string | null
          id: string
          knowledge: string | null
          name: string
          starter_prompts: Json
          system_prompt: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_model_family?: string
          description?: string | null
          emoji?: string | null
          id?: string
          knowledge?: string | null
          name: string
          starter_prompts?: Json
          system_prompt?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_model_family?: string
          description?: string | null
          emoji?: string | null
          id?: string
          knowledge?: string | null
          name?: string
          starter_prompts?: Json
          system_prompt?: string
          updated_at?: string
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
      published_sites: {
        Row: {
          code: string | null
          code_language: string | null
          created_at: string
          favicon_data: string | null
          favicon_svg: string | null
          id: string
          netlify_site_id: string
          og_description: string | null
          og_image_url: string | null
          og_title: string | null
          subdomain: string
          title: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          code?: string | null
          code_language?: string | null
          created_at?: string
          favicon_data?: string | null
          favicon_svg?: string | null
          id?: string
          netlify_site_id: string
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          subdomain: string
          title?: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          code?: string | null
          code_language?: string | null
          created_at?: string
          favicon_data?: string | null
          favicon_svg?: string | null
          id?: string
          netlify_site_id?: string
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          subdomain?: string
          title?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
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
      scheduled_task_runs: {
        Row: {
          chat_session_id: string | null
          error: string | null
          finished_at: string | null
          id: string
          output: string | null
          started_at: string
          status: string
          task_id: string
          user_id: string
        }
        Insert: {
          chat_session_id?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          output?: string | null
          started_at?: string
          status?: string
          task_id: string
          user_id: string
        }
        Update: {
          chat_session_id?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          output?: string | null
          started_at?: string
          status?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_task_runs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "scheduled_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_tasks: {
        Row: {
          agent_id: string | null
          created_at: string
          cron_expr: string | null
          id: string
          last_run_at: string | null
          model: string | null
          next_run_at: string | null
          notify_email: boolean
          prompt: string
          push_on_complete: boolean
          result_chat_id: string | null
          run_at: string | null
          schedule_type: string
          status: string
          timezone: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          cron_expr?: string | null
          id?: string
          last_run_at?: string | null
          model?: string | null
          next_run_at?: string | null
          notify_email?: boolean
          prompt: string
          push_on_complete?: boolean
          result_chat_id?: string | null
          run_at?: string | null
          schedule_type: string
          status?: string
          timezone?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          cron_expr?: string | null
          id?: string
          last_run_at?: string | null
          model?: string | null
          next_run_at?: string | null
          notify_email?: boolean
          prompt?: string
          push_on_complete?: boolean
          result_chat_id?: string | null
          run_at?: string | null
          schedule_type?: string
          status?: string
          timezone?: string
          title?: string
          updated_at?: string
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
      shared_chat_invites: {
        Row: {
          accepted_at: string | null
          chat_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          chat_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          chat_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_chat_invites_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "shared_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_chat_members: {
        Row: {
          chat_id: string
          id: string
          joined_at: string
          last_read_at: string
          role: string
          user_id: string
        }
        Insert: {
          chat_id: string
          id?: string
          joined_at?: string
          last_read_at?: string
          role?: string
          user_id: string
        }
        Update: {
          chat_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_chat_members_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "shared_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_chat_messages: {
        Row: {
          attachments: Json | null
          author_user_id: string | null
          chat_id: string
          content: string
          created_at: string
          id: string
          mentions: string[] | null
          role: string
        }
        Insert: {
          attachments?: Json | null
          author_user_id?: string | null
          chat_id: string
          content: string
          created_at?: string
          id?: string
          mentions?: string[] | null
          role?: string
        }
        Update: {
          attachments?: Json | null
          author_user_id?: string | null
          chat_id?: string
          content?: string
          created_at?: string
          id?: string
          mentions?: string[] | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "shared_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_chats: {
        Row: {
          agent_id: string | null
          canvas_content: string | null
          created_at: string
          id: string
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          canvas_content?: string | null
          created_at?: string
          id?: string
          owner_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          canvas_content?: string | null
          created_at?: string
          id?: string
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          paddle_customer_id: string | null
          paddle_price_id: string | null
          paddle_product_id: string | null
          paddle_subscription_id: string | null
          price_id: string | null
          product_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          paddle_customer_id?: string | null
          paddle_price_id?: string | null
          paddle_product_id?: string | null
          paddle_subscription_id?: string | null
          price_id?: string | null
          product_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          paddle_customer_id?: string | null
          paddle_price_id?: string | null
          paddle_product_id?: string | null
          paddle_subscription_id?: string | null
          price_id?: string | null
          product_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          created_at: string
          id: string
          priority: string
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          priority?: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          priority?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          image_url: string | null
          is_admin_reply: boolean
          sender_id: string
          ticket_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_admin_reply?: boolean
          sender_id: string
          ticket_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_admin_reply?: boolean
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_conversations: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      voice_diagnostics: {
        Row: {
          connection_state: string | null
          created_at: string
          details: Json
          event_type: string
          id: string
          message: string | null
          session_id: string | null
          tool_call_id: string | null
          tool_name: string | null
          user_id: string
        }
        Insert: {
          connection_state?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          message?: string | null
          session_id?: string | null
          tool_call_id?: string | null
          tool_name?: string | null
          user_id: string
        }
        Update: {
          connection_state?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          message?: string | null
          session_id?: string | null
          tool_call_id?: string | null
          tool_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      count_user_images: { Args: { target_user_id: string }; Returns: number }
      count_voice_conversations_30d: {
        Args: { target_user_id: string }
        Returns: number
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      is_admin_user: { Args: never; Returns: boolean }
      is_shared_chat_member: {
        Args: { _chat_id: string; _user_id: string }
        Returns: boolean
      }
      is_shared_chat_owner: {
        Args: { _chat_id: string; _user_id: string }
        Returns: boolean
      }
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
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_voice_conversation: {
        Args: { target_user_id: string }
        Returns: undefined
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
      user_has_boost: { Args: { check_user_id: string }; Returns: boolean }
      user_has_pro_access: { Args: { check_user_id: string }; Returns: boolean }
      users_share_shared_chat: {
        Args: { _a: string; _b: string }
        Returns: boolean
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
