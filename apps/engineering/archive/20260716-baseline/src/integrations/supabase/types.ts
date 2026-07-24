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
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      job_history: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          job_id: string
          note: string | null
          status: Database["public"]["Enums"]["job_status"] | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          job_id: string
          note?: string | null
          status?: Database["public"]["Enums"]["job_status"] | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          job_id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["job_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "job_history_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "repair_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_types: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_types_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      machines: {
        Row: {
          code: string | null
          created_at: string
          id: string
          machine_type_id: string | null
          name: string
          repair_department_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          machine_type_id?: string | null
          name: string
          repair_department_id?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          machine_type_id?: string | null
          name?: string
          repair_department_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "machines_machine_type_id_fkey"
            columns: ["machine_type_id"]
            isOneToOne: false
            referencedRelation: "machine_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_repair_department_id_fkey"
            columns: ["repair_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_requisitions: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          id: string
          job_code: string | null
          job_id: string | null
          part_code: string | null
          part_name: string | null
          qty: string | null
          repairer_id: string | null
          req_date: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          job_code?: string | null
          job_id?: string | null
          part_code?: string | null
          part_name?: string | null
          qty?: string | null
          repairer_id?: string | null
          req_date?: string
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          job_code?: string | null
          job_id?: string | null
          part_code?: string | null
          part_name?: string | null
          qty?: string | null
          repairer_id?: string | null
          req_date?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parts_requisitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_requisitions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_requisitions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "repair_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_requisitions_repairer_id_fkey"
            columns: ["repairer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_session_id: string | null
          active_session_seen_at: string | null
          allowed_repair_dept_ids: string[]
          code: string
          created_at: string
          department_id: string | null
          full_name: string
          id: string
        }
        Insert: {
          active_session_id?: string | null
          active_session_seen_at?: string | null
          allowed_repair_dept_ids?: string[]
          code: string
          created_at?: string
          department_id?: string | null
          full_name: string
          id: string
        }
        Update: {
          active_session_id?: string | null
          active_session_seen_at?: string | null
          allowed_repair_dept_ids?: string[]
          code?: string
          created_at?: string
          department_id?: string | null
          full_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_jobs: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          completed_at: string | null
          completed_image_url: string | null
          created_at: string
          department_id: string | null
          description: string | null
          id: string
          image_url: string | null
          job_code: string
          machine_id: string | null
          machine_type_id: string | null
          parts_used: Json
          reject_reason: string | null
          reporter_id: string
          reviewed_at: string | null
          sheet_row_index: number | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
          work_summary: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_image_url?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          job_code: string
          machine_id?: string | null
          machine_type_id?: string | null
          parts_used?: Json
          reject_reason?: string | null
          reporter_id: string
          reviewed_at?: string | null
          sheet_row_index?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at?: string
          work_summary?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_image_url?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          job_code?: string
          machine_id?: string | null
          machine_type_id?: string | null
          parts_used?: Json
          reject_reason?: string | null
          reporter_id?: string
          reviewed_at?: string | null
          sheet_row_index?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string
          work_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_jobs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_jobs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_jobs_machine_type_id_fkey"
            columns: ["machine_type_id"]
            isOneToOne: false
            referencedRelation: "machine_types"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_dept: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "leader" | "repairer" | "reporter" | "department_head"
      job_status:
        | "pending_assign"
        | "in_progress"
        | "waiting_parts"
        | "external"
        | "awaiting_review"
        | "completed"
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
      app_role: ["admin", "leader", "repairer", "reporter", "department_head"],
      job_status: [
        "pending_assign",
        "in_progress",
        "waiting_parts",
        "external",
        "awaiting_review",
        "completed",
      ],
    },
  },
} as const
