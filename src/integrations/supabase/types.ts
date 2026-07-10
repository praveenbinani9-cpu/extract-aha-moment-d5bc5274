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
      billing_errors: {
        Row: {
          created_at: string
          error_message: string
          extraction_id: string | null
          id: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          error_message: string
          extraction_id?: string | null
          id?: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string
          extraction_id?: string | null
          id?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      extractions: {
        Row: {
          billed_pages: number | null
          created_at: string
          document_type: string | null
          id: string
          overall_confidence: number | null
          page_count: number | null
          result: Json
          tenant_id: string
        }
        Insert: {
          billed_pages?: number | null
          created_at?: string
          document_type?: string | null
          id?: string
          overall_confidence?: number | null
          page_count?: number | null
          result: Json
          tenant_id: string
        }
        Update: {
          billed_pages?: number | null
          created_at?: string
          document_type?: string | null
          id?: string
          overall_confidence?: number | null
          page_count?: number | null
          result?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extractions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          billing_month: string
          due_date: string
          generated_at: string
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string
          payment_reference: string | null
          status: string
          tenant_id: string
          total_amount: number
          total_pages: number
        }
        Insert: {
          billing_month: string
          due_date: string
          generated_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string
          payment_reference?: string | null
          status?: string
          tenant_id: string
          total_amount: number
          total_pages: number
        }
        Update: {
          billing_month?: string
          due_date?: string
          generated_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string
          payment_reference?: string | null
          status?: string
          tenant_id?: string
          total_amount?: number
          total_pages?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_usage: {
        Row: {
          created_at: string
          extraction_count: number
          id: string
          tenant_id: string
          updated_at: string
          usage_month: string
        }
        Insert: {
          created_at?: string
          extraction_count?: number
          id?: string
          tenant_id: string
          updated_at?: string
          usage_month: string
        }
        Update: {
          created_at?: string
          extraction_count?: number
          id?: string
          tenant_id?: string
          updated_at?: string
          usage_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          api_key: string
          billing_contact_name: string | null
          billing_email: string | null
          billing_phone: string | null
          created_at: string
          id: string
          monthly_limit: number
          name: string
          rate_per_page: number
          status: string
        }
        Insert: {
          api_key: string
          billing_contact_name?: string | null
          billing_email?: string | null
          billing_phone?: string | null
          created_at?: string
          id?: string
          monthly_limit?: number
          name: string
          rate_per_page?: number
          status?: string
        }
        Update: {
          api_key?: string
          billing_contact_name?: string | null
          billing_email?: string | null
          billing_phone?: string | null
          created_at?: string
          id?: string
          monthly_limit?: number
          name?: string
          rate_per_page?: number
          status?: string
        }
        Relationships: []
      }
      usage_ledger: {
        Row: {
          amount: number
          billing_month: string
          created_at: string
          extraction_id: string
          id: string
          invoice_id: string | null
          page_count: number
          rate_per_page: number
          tenant_id: string
        }
        Insert: {
          amount: number
          billing_month: string
          created_at?: string
          extraction_id: string
          id?: string
          invoice_id?: string | null
          page_count: number
          rate_per_page: number
          tenant_id: string
        }
        Update: {
          amount?: number
          billing_month?: string
          created_at?: string
          extraction_id?: string
          id?: string
          invoice_id?: string | null
          page_count?: number
          rate_per_page?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_ledger_extraction_id_fkey"
            columns: ["extraction_id"]
            isOneToOne: true
            referencedRelation: "extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_ledger_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_usage: {
        Args: { p_count?: number; p_month: string; p_tenant_id: string }
        Returns: undefined
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
