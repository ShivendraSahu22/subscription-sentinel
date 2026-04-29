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
      cancellation_suggestions: {
        Row: {
          classification_id: string
          created_at: string
          id: string
          suggestion: string
          usage: string | null
          user_id: string
        }
        Insert: {
          classification_id: string
          created_at?: string
          id?: string
          suggestion: string
          usage?: string | null
          user_id: string
        }
        Update: {
          classification_id?: string
          created_at?: string
          id?: string
          suggestion?: string
          usage?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_suggestions_classification_id_fkey"
            columns: ["classification_id"]
            isOneToOne: false
            referencedRelation: "classifications"
            referencedColumns: ["id"]
          },
        ]
      }
      classifications: {
        Row: {
          amount: string | null
          cancellation_link: string | null
          category: string
          created_at: string
          currency: string | null
          email_body: string
          frequency: string | null
          id: string
          next_billing_date: string | null
          priority: string | null
          risk_signals: string[] | null
          sender_email: string | null
          service_name: string | null
          subscription_type: string | null
          trial_end_date: string | null
          user_id: string | null
        }
        Insert: {
          amount?: string | null
          cancellation_link?: string | null
          category: string
          created_at?: string
          currency?: string | null
          email_body: string
          frequency?: string | null
          id?: string
          next_billing_date?: string | null
          priority?: string | null
          risk_signals?: string[] | null
          sender_email?: string | null
          service_name?: string | null
          subscription_type?: string | null
          trial_end_date?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: string | null
          cancellation_link?: string | null
          category?: string
          created_at?: string
          currency?: string | null
          email_body?: string
          frequency?: string | null
          id?: string
          next_billing_date?: string | null
          priority?: string | null
          risk_signals?: string[] | null
          sender_email?: string | null
          service_name?: string | null
          subscription_type?: string | null
          trial_end_date?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      decisions: {
        Row: {
          classification_id: string
          created_at: string
          decision: string
          id: string
          preference: string | null
          reason: string
          usage: string | null
          user_id: string
        }
        Insert: {
          classification_id: string
          created_at?: string
          decision: string
          id?: string
          preference?: string | null
          reason: string
          usage?: string | null
          user_id: string
        }
        Update: {
          classification_id?: string
          created_at?: string
          decision?: string
          id?: string
          preference?: string | null
          reason?: string
          usage?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_classification_id_fkey"
            columns: ["classification_id"]
            isOneToOne: false
            referencedRelation: "classifications"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          classification_id: string
          created_at: string
          id: string
          message: string
          type: string
          user_id: string
        }
        Insert: {
          classification_id: string
          created_at?: string
          id?: string
          message: string
          type: string
          user_id: string
        }
        Update: {
          classification_id?: string
          created_at?: string
          id?: string
          message?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_classification_id_fkey"
            columns: ["classification_id"]
            isOneToOne: false
            referencedRelation: "classifications"
            referencedColumns: ["id"]
          },
        ]
      }
      summaries: {
        Row: {
          classifications_count: number
          created_at: string
          id: string
          summary: string
          user_id: string
        }
        Insert: {
          classifications_count?: number
          created_at?: string
          id?: string
          summary: string
          user_id: string
        }
        Update: {
          classifications_count?: number
          created_at?: string
          id?: string
          summary?: string
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
