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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_config: {
        Row: {
          agent_id: string
          agent_persona_name: string | null
          ai_restrictions: string | null
          company_name: string | null
          created_at: string
          first_prospecting_message: string | null
          id: string
          objection_handlers: Json | null
          product_service_description: string | null
          prospecting_messages: Json | null
          qualification_questions: Json | null
          segment: string | null
          tone: Database["public"]["Enums"]["tone_type"]
          transfer_summary_template: string | null
          updated_at: string
          welcome_message: string | null
        }
        Insert: {
          agent_id: string
          agent_persona_name?: string | null
          ai_restrictions?: string | null
          company_name?: string | null
          created_at?: string
          first_prospecting_message?: string | null
          id?: string
          objection_handlers?: Json | null
          product_service_description?: string | null
          prospecting_messages?: Json | null
          qualification_questions?: Json | null
          segment?: string | null
          tone?: Database["public"]["Enums"]["tone_type"]
          transfer_summary_template?: string | null
          updated_at?: string
          welcome_message?: string | null
        }
        Update: {
          agent_id?: string
          agent_persona_name?: string | null
          ai_restrictions?: string | null
          company_name?: string | null
          created_at?: string
          first_prospecting_message?: string | null
          id?: string
          objection_handlers?: Json | null
          product_service_description?: string | null
          prospecting_messages?: Json | null
          qualification_questions?: Json | null
          segment?: string | null
          tone?: Database["public"]["Enums"]["tone_type"]
          transfer_summary_template?: string | null
          updated_at?: string
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_config_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_integrations: {
        Row: {
          agent_id: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          provider: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          provider: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_integrations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          created_at: string
          custom_prompt_enabled: boolean
          device_id: string | null
          followup_interval_minutes: number | null
          followup_max: number | null
          followup_start_message: number | null
          id: string
          llm_api_key: string | null
          llm_model: string | null
          llm_provider: Database["public"]["Enums"]["llm_provider"]
          name: string
          prompt_compiled: string | null
          restrictions: string | null
          status: Database["public"]["Enums"]["agent_status"]
          transfer_number: string | null
          transfer_trigger: string | null
          type: Database["public"]["Enums"]["agent_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_prompt_enabled?: boolean
          device_id?: string | null
          followup_interval_minutes?: number | null
          followup_max?: number | null
          followup_start_message?: number | null
          id?: string
          llm_api_key?: string | null
          llm_model?: string | null
          llm_provider?: Database["public"]["Enums"]["llm_provider"]
          name: string
          prompt_compiled?: string | null
          restrictions?: string | null
          status?: Database["public"]["Enums"]["agent_status"]
          transfer_number?: string | null
          transfer_trigger?: string | null
          type?: Database["public"]["Enums"]["agent_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_prompt_enabled?: boolean
          device_id?: string | null
          followup_interval_minutes?: number | null
          followup_max?: number | null
          followup_start_message?: number | null
          id?: string
          llm_api_key?: string | null
          llm_model?: string | null
          llm_provider?: Database["public"]["Enums"]["llm_provider"]
          name?: string
          prompt_compiled?: string | null
          restrictions?: string | null
          status?: Database["public"]["Enums"]["agent_status"]
          transfer_number?: string | null
          transfer_trigger?: string | null
          type?: Database["public"]["Enums"]["agent_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          agent_id: string
          clinic_name: string | null
          confirmed_at: string | null
          confirmed_via: string | null
          contact_name: string | null
          contact_number: string
          conversation_id: string | null
          created_at: string
          device_id: string | null
          ecuro_environment: string | null
          end_time: string | null
          external_id: string | null
          id: string
          reminder_24h_sent_at: string | null
          reminder_24h_status: Database["public"]["Enums"]["reminder_status"]
          reminder_2h_sent_at: string | null
          reminder_2h_status: Database["public"]["Enums"]["reminder_status"]
          specialty_name: string | null
          start_time: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          clinic_name?: string | null
          confirmed_at?: string | null
          confirmed_via?: string | null
          contact_name?: string | null
          contact_number: string
          conversation_id?: string | null
          created_at?: string
          device_id?: string | null
          ecuro_environment?: string | null
          end_time?: string | null
          external_id?: string | null
          id?: string
          reminder_24h_sent_at?: string | null
          reminder_24h_status?: Database["public"]["Enums"]["reminder_status"]
          reminder_2h_sent_at?: string | null
          reminder_2h_status?: Database["public"]["Enums"]["reminder_status"]
          specialty_name?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          clinic_name?: string | null
          confirmed_at?: string | null
          confirmed_via?: string | null
          contact_name?: string | null
          contact_number?: string
          conversation_id?: string | null
          created_at?: string
          device_id?: string | null
          ecuro_environment?: string | null
          end_time?: string | null
          external_id?: string | null
          id?: string
          reminder_24h_sent_at?: string | null
          reminder_24h_status?: Database["public"]["Enums"]["reminder_status"]
          reminder_2h_sent_at?: string | null
          reminder_2h_status?: Database["public"]["Enums"]["reminder_status"]
          specialty_name?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      blacklist: {
        Row: {
          created_at: string | null
          device_id: string | null
          id: string
          label: string | null
          phone: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_id?: string | null
          id?: string
          label?: string | null
          phone: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_id?: string | null
          id?: string
          label?: string | null
          phone?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blacklist_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      blast_campaigns: {
        Row: {
          agent_id: string
          batch_size: number
          completed_at: string | null
          created_at: string
          error_count: number
          id: string
          interval_seconds: number
          name: string
          scheduled_at: string | null
          sent_count: number
          started_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          total_contacts: number
          user_id: string
        }
        Insert: {
          agent_id: string
          batch_size?: number
          completed_at?: string | null
          created_at?: string
          error_count?: number
          id?: string
          interval_seconds?: number
          name: string
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          total_contacts?: number
          user_id: string
        }
        Update: {
          agent_id?: string
          batch_size?: number
          completed_at?: string | null
          created_at?: string
          error_count?: number
          id?: string
          interval_seconds?: number
          name?: string
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          total_contacts?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blast_campaigns_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      blast_contacts: {
        Row: {
          campaign_id: string
          custom_vars: Json | null
          error_message: string | null
          id: string
          metadata: Json | null
          name: string | null
          phone: string
          sent_at: string | null
          status: Database["public"]["Enums"]["contact_status"]
        }
        Insert: {
          campaign_id: string
          custom_vars?: Json | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          phone: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["contact_status"]
        }
        Update: {
          campaign_id?: string
          custom_vars?: Json | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          phone?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["contact_status"]
        }
        Relationships: [
          {
            foreignKeyName: "blast_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "blast_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_warmups: {
        Row: {
          api_url: string
          created_at: string
          id: string
          instance_name: string | null
          provider: string
          status: string
          token: string | null
          user_id: string
        }
        Insert: {
          api_url: string
          created_at?: string
          id?: string
          instance_name?: string | null
          provider: string
          status?: string
          token?: string | null
          user_id: string
        }
        Update: {
          api_url?: string
          created_at?: string
          id?: string
          instance_name?: string | null
          provider?: string
          status?: string
          token?: string | null
          user_id?: string
        }
        Relationships: []
      }
      client_device_access: {
        Row: {
          created_at: string
          device_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          agent_id: string
          agent_paused: boolean
          contact_name: string | null
          contact_number: string
          created_at: string
          device_id: string | null
          followup_count: number
          id: string
          instance_name: string | null
          is_waiting_reply: boolean
          last_message_at: string | null
          paused_by: Database["public"]["Enums"]["pause_origin"]
          status: Database["public"]["Enums"]["conversation_status"]
        }
        Insert: {
          agent_id: string
          agent_paused?: boolean
          contact_name?: string | null
          contact_number: string
          created_at?: string
          device_id?: string | null
          followup_count?: number
          id?: string
          instance_name?: string | null
          is_waiting_reply?: boolean
          last_message_at?: string | null
          paused_by?: Database["public"]["Enums"]["pause_origin"]
          status?: Database["public"]["Enums"]["conversation_status"]
        }
        Update: {
          agent_id?: string
          agent_paused?: boolean
          contact_name?: string | null
          contact_number?: string
          created_at?: string
          device_id?: string | null
          followup_count?: number
          id?: string
          instance_name?: string | null
          is_waiting_reply?: boolean
          last_message_at?: string | null
          paused_by?: Database["public"]["Enums"]["pause_origin"]
          status?: Database["public"]["Enums"]["conversation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string
          evolution_api_key: string
          evolution_api_url: string
          id: string
          instance_name: string
          last_connected_at: string | null
          name: string
          phone_number: string | null
          qr_code: string | null
          status: Database["public"]["Enums"]["device_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          evolution_api_key: string
          evolution_api_url: string
          id?: string
          instance_name: string
          last_connected_at?: string | null
          name: string
          phone_number?: string | null
          qr_code?: string | null
          status?: Database["public"]["Enums"]["device_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          evolution_api_key?: string
          evolution_api_url?: string
          id?: string
          instance_name?: string
          last_connected_at?: string | null
          name?: string
          phone_number?: string | null
          qr_code?: string | null
          status?: Database["public"]["Enums"]["device_status"]
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          evolution_message_id: string | null
          id: string
          media_type: Database["public"]["Enums"]["media_type"] | null
          media_url: string | null
          role: Database["public"]["Enums"]["message_role"]
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          evolution_message_id?: string | null
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"] | null
          media_url?: string | null
          role: Database["public"]["Enums"]["message_role"]
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          evolution_message_id?: string | null
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"] | null
          media_url?: string | null
          role?: Database["public"]["Enums"]["message_role"]
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          plan: Database["public"]["Enums"]["plan_type"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
          plan?: Database["public"]["Enums"]["plan_type"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          plan?: Database["public"]["Enums"]["plan_type"]
          updated_at?: string
        }
        Relationships: []
      }
      simulator_shares: {
        Row: {
          agent_id: string
          created_at: string
          expires_at: string
          id: string
          token: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulator_shares_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warmup_evolution_instances: {
        Row: {
          created_at: string
          evolution_api_key: string
          evolution_api_url: string
          id: string
          instance_name: string
          label: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evolution_api_key: string
          evolution_api_url: string
          id?: string
          instance_name: string
          label: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          evolution_api_key?: string
          evolution_api_url?: string
          id?: string
          instance_name?: string
          label?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      warmup_evolution_servers: {
        Row: {
          created_at: string
          evolution_api_key: string
          evolution_api_url: string
          id: string
          label: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evolution_api_key: string
          evolution_api_url: string
          id?: string
          label: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          evolution_api_key?: string
          evolution_api_url?: string
          id?: string
          label?: string
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
      [_ in never]: never
    }
    Enums: {
      agent_status: "active" | "paused" | "inactive"
      agent_type: "receptive" | "prospecting"
      app_role: "admin" | "moderator" | "user" | "client"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "cancelled"
        | "completed"
        | "pending_external_id"
      campaign_status: "pending" | "running" | "paused" | "completed" | "error"
      contact_status: "pending" | "sent" | "error" | "replied"
      conversation_status: "active" | "paused" | "transferred" | "closed"
      device_status: "disconnected" | "connecting" | "connected" | "error"
      llm_provider: "claude" | "openai" | "deepseek"
      media_type: "image" | "audio" | "document" | "video"
      message_role: "user" | "assistant" | "system"
      pause_origin: "none" | "ai" | "human"
      plan_type: "free" | "pro" | "enterprise"
      reminder_status: "pending" | "sent" | "confirmed" | "skipped"
      tone_type: "formal" | "semi-formal" | "casual"
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
    Enums: {
      agent_status: ["active", "paused", "inactive"],
      agent_type: ["receptive", "prospecting"],
      app_role: ["admin", "moderator", "user", "client"],
      appointment_status: [
        "scheduled",
        "confirmed",
        "cancelled",
        "completed",
        "pending_external_id",
      ],
      campaign_status: ["pending", "running", "paused", "completed", "error"],
      contact_status: ["pending", "sent", "error", "replied"],
      conversation_status: ["active", "paused", "transferred", "closed"],
      device_status: ["disconnected", "connecting", "connected", "error"],
      llm_provider: ["claude", "openai", "deepseek"],
      media_type: ["image", "audio", "document", "video"],
      message_role: ["user", "assistant", "system"],
      pause_origin: ["none", "ai", "human"],
      plan_type: ["free", "pro", "enterprise"],
      reminder_status: ["pending", "sent", "confirmed", "skipped"],
      tone_type: ["formal", "semi-formal", "casual"],
    },
  },
} as const
