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
      asset_purchase_requests: {
        Row: {
          accounting_role: string | null
          accounting_signature: string | null
          approval_result: string | null
          approved_at: string | null
          approver_note: string | null
          approver_role: string | null
          approver_signature: string | null
          asset_code: string | null
          asset_dept_signature: string | null
          asset_disposal_method: string | null
          asset_name: string | null
          asset_quantity: string | null
          asset_received_at: string | null
          asset_receiver_role: string | null
          asset_receiver_signature: string | null
          asset_registered_at: string | null
          asset_registrar_role: string | null
          asset_type: string | null
          asset_unit: string | null
          asset_user: string | null
          cc_recipients: string[]
          company: string
          created_at: string
          department: string
          details: string | null
          doc_date: string
          doc_no: string
          id: string
          new_asset_image: string | null
          no_po_reason: string | null
          old_asset_image: string | null
          old_asset_info: string | null
          po_status: string | null
          purchase_date: string | null
          purchase_quantity: string | null
          purchasing_at: string | null
          purchasing_note: string | null
          purchasing_role: string | null
          purchasing_signature: string | null
          quotation1_image: string | null
          quotation2_image: string | null
          quotation3_image: string | null
          quotation4_image: string | null
          quotation5_image: string | null
          quotation6_image: string | null
          receipt_no: string | null
          receive_items: Json | null
          receive_note: string | null
          receive_round: number
          received_at: string | null
          recipients: string[]
          reject_reason: string | null
          repair_form_image: string | null
          requester_role: string | null
          requester_signature: string | null
          requisition_no: string | null
          return_count: number
          return_reason_1: string | null
          return_reason_2: string | null
          return_reason_3: string | null
          selected_quotation: string | null
          selected_spec: string | null
          spec_image: string | null
          spec_image_2: string | null
          spec_image_3: string | null
          spec_image_4: string | null
          spec_image_5: string | null
          spec_image_6: string | null
          status: string
          tax_invoice_image: string | null
          topic: string
          total_value: number | null
          trade_in_value: number | null
          transfer_date: string | null
          transfer_items: Json | null
          transfer_no: string | null
          transfer_responsibility_note: string | null
          transfer_role: string | null
          transfer_signature: string | null
          transferred_at: string | null
          unit: string | null
          updated_at: string
          value_before_vat: number | null
          vat_amount: number | null
          writeoff_at: string | null
          writeoff_department: string | null
          writeoff_note: string | null
          writeoff_old_asset: string | null
          writeoff_person: string | null
          writeoff_status: string | null
        }
        Insert: {
          accounting_role?: string | null
          accounting_signature?: string | null
          approval_result?: string | null
          approved_at?: string | null
          approver_note?: string | null
          approver_role?: string | null
          approver_signature?: string | null
          asset_code?: string | null
          asset_dept_signature?: string | null
          asset_disposal_method?: string | null
          asset_name?: string | null
          asset_quantity?: string | null
          asset_received_at?: string | null
          asset_receiver_role?: string | null
          asset_receiver_signature?: string | null
          asset_registered_at?: string | null
          asset_registrar_role?: string | null
          asset_type?: string | null
          asset_unit?: string | null
          asset_user?: string | null
          cc_recipients?: string[]
          company: string
          created_at?: string
          department: string
          details?: string | null
          doc_date?: string
          doc_no: string
          id?: string
          new_asset_image?: string | null
          no_po_reason?: string | null
          old_asset_image?: string | null
          old_asset_info?: string | null
          po_status?: string | null
          purchase_date?: string | null
          purchase_quantity?: string | null
          purchasing_at?: string | null
          purchasing_note?: string | null
          purchasing_role?: string | null
          purchasing_signature?: string | null
          quotation1_image?: string | null
          quotation2_image?: string | null
          quotation3_image?: string | null
          quotation4_image?: string | null
          quotation5_image?: string | null
          quotation6_image?: string | null
          receipt_no?: string | null
          receive_items?: Json | null
          receive_note?: string | null
          receive_round?: number
          received_at?: string | null
          recipients?: string[]
          reject_reason?: string | null
          repair_form_image?: string | null
          requester_role?: string | null
          requester_signature?: string | null
          requisition_no?: string | null
          return_count?: number
          return_reason_1?: string | null
          return_reason_2?: string | null
          return_reason_3?: string | null
          selected_quotation?: string | null
          selected_spec?: string | null
          spec_image?: string | null
          spec_image_2?: string | null
          spec_image_3?: string | null
          spec_image_4?: string | null
          spec_image_5?: string | null
          spec_image_6?: string | null
          status?: string
          tax_invoice_image?: string | null
          topic: string
          total_value?: number | null
          trade_in_value?: number | null
          transfer_date?: string | null
          transfer_items?: Json | null
          transfer_no?: string | null
          transfer_responsibility_note?: string | null
          transfer_role?: string | null
          transfer_signature?: string | null
          transferred_at?: string | null
          unit?: string | null
          updated_at?: string
          value_before_vat?: number | null
          vat_amount?: number | null
          writeoff_at?: string | null
          writeoff_department?: string | null
          writeoff_note?: string | null
          writeoff_old_asset?: string | null
          writeoff_person?: string | null
          writeoff_status?: string | null
        }
        Update: {
          accounting_role?: string | null
          accounting_signature?: string | null
          approval_result?: string | null
          approved_at?: string | null
          approver_note?: string | null
          approver_role?: string | null
          approver_signature?: string | null
          asset_code?: string | null
          asset_dept_signature?: string | null
          asset_disposal_method?: string | null
          asset_name?: string | null
          asset_quantity?: string | null
          asset_received_at?: string | null
          asset_receiver_role?: string | null
          asset_receiver_signature?: string | null
          asset_registered_at?: string | null
          asset_registrar_role?: string | null
          asset_type?: string | null
          asset_unit?: string | null
          asset_user?: string | null
          cc_recipients?: string[]
          company?: string
          created_at?: string
          department?: string
          details?: string | null
          doc_date?: string
          doc_no?: string
          id?: string
          new_asset_image?: string | null
          no_po_reason?: string | null
          old_asset_image?: string | null
          old_asset_info?: string | null
          po_status?: string | null
          purchase_date?: string | null
          purchase_quantity?: string | null
          purchasing_at?: string | null
          purchasing_note?: string | null
          purchasing_role?: string | null
          purchasing_signature?: string | null
          quotation1_image?: string | null
          quotation2_image?: string | null
          quotation3_image?: string | null
          quotation4_image?: string | null
          quotation5_image?: string | null
          quotation6_image?: string | null
          receipt_no?: string | null
          receive_items?: Json | null
          receive_note?: string | null
          receive_round?: number
          received_at?: string | null
          recipients?: string[]
          reject_reason?: string | null
          repair_form_image?: string | null
          requester_role?: string | null
          requester_signature?: string | null
          requisition_no?: string | null
          return_count?: number
          return_reason_1?: string | null
          return_reason_2?: string | null
          return_reason_3?: string | null
          selected_quotation?: string | null
          selected_spec?: string | null
          spec_image?: string | null
          spec_image_2?: string | null
          spec_image_3?: string | null
          spec_image_4?: string | null
          spec_image_5?: string | null
          spec_image_6?: string | null
          status?: string
          tax_invoice_image?: string | null
          topic?: string
          total_value?: number | null
          trade_in_value?: number | null
          transfer_date?: string | null
          transfer_items?: Json | null
          transfer_no?: string | null
          transfer_responsibility_note?: string | null
          transfer_role?: string | null
          transfer_signature?: string | null
          transferred_at?: string | null
          unit?: string | null
          updated_at?: string
          value_before_vat?: number | null
          vat_amount?: number | null
          writeoff_at?: string | null
          writeoff_department?: string | null
          writeoff_note?: string | null
          writeoff_old_asset?: string | null
          writeoff_person?: string | null
          writeoff_status?: string | null
        }
        Relationships: []
      }
      asset_transfer_history: {
        Row: {
          asset_code: string | null
          asset_name: string | null
          created_at: string
          from_user: string
          id: string
          note: string | null
          officer_role: string | null
          officer_signature: string
          reason: string | null
          source_doc_id: string | null
          source_doc_no: string | null
          to_user: string
          transfer_date: string
        }
        Insert: {
          asset_code?: string | null
          asset_name?: string | null
          created_at?: string
          from_user: string
          id?: string
          note?: string | null
          officer_role?: string | null
          officer_signature: string
          reason?: string | null
          source_doc_id?: string | null
          source_doc_no?: string | null
          to_user: string
          transfer_date?: string
        }
        Update: {
          asset_code?: string | null
          asset_name?: string | null
          created_at?: string
          from_user?: string
          id?: string
          note?: string | null
          officer_role?: string | null
          officer_signature?: string
          reason?: string | null
          source_doc_id?: string | null
          source_doc_no?: string | null
          to_user?: string
          transfer_date?: string
        }
        Relationships: []
      }
      department_passwords: {
        Row: {
          aliases: string[]
          created_at: string
          department_name: string
          has_password: boolean | null
          id: string
          password_hash: string | null
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          created_at?: string
          department_name: string
          has_password?: boolean | null
          id?: string
          password_hash?: string | null
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          created_at?: string
          department_name?: string
          has_password?: boolean | null
          id?: string
          password_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      doc_number_sequences: {
        Row: {
          last_number: number
          year: number
        }
        Insert: {
          last_number?: number
          year: number
        }
        Update: {
          last_number?: number
          year?: number
        }
        Relationships: []
      }
      dropdown_options: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          sort_order: number
          value: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          value: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          value?: string
        }
        Relationships: []
      }
      person_receive_passwords: {
        Row: {
          created_at: string
          display_name: string
          has_password: boolean | null
          id: string
          is_active: boolean
          note: string | null
          password_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          has_password?: boolean | null
          id?: string
          is_active?: boolean
          note?: string | null
          password_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          has_password?: boolean | null
          id?: string
          is_active?: boolean
          note?: string | null
          password_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_assignments: {
        Row: {
          created_at: string
          display_name: string
          has_password: boolean | null
          id: string
          is_active: boolean
          is_admin: boolean
          password_hash: string | null
          role_code: string
          step_access: number[]
        }
        Insert: {
          created_at?: string
          display_name: string
          has_password?: boolean | null
          id?: string
          is_active?: boolean
          is_admin?: boolean
          password_hash?: string | null
          role_code: string
          step_access?: number[]
        }
        Update: {
          created_at?: string
          display_name?: string
          has_password?: boolean | null
          id?: string
          is_active?: boolean
          is_admin?: boolean
          password_hash?: string | null
          role_code?: string
          step_access?: number[]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_change_password: {
        Args: {
          _admin_code: string
          _admin_password: string
          _new_password: string
          _target_code: string
        }
        Returns: boolean
      }
      admin_create_user: {
        Args: {
          _admin_code: string
          _admin_password: string
          _display_name: string
          _is_admin: boolean
          _new_password: string
          _role_code: string
          _step_access: number[]
        }
        Returns: boolean
      }
      admin_delete_user: {
        Args: {
          _admin_code: string
          _admin_password: string
          _target_code: string
        }
        Returns: boolean
      }
      admin_rename_person_receive: {
        Args: {
          _admin_code: string
          _admin_password: string
          _new_name: string
          _old_name: string
        }
        Returns: boolean
      }
      admin_set_person_receive_active: {
        Args: {
          _admin_code: string
          _admin_password: string
          _display_name: string
          _is_active: boolean
        }
        Returns: boolean
      }
      admin_update_user: {
        Args: {
          _admin_code: string
          _admin_password: string
          _display_name: string
          _is_active: boolean
          _is_admin: boolean
          _step_access: number[]
          _target_code: string
        }
        Returns: boolean
      }
      admin_upsert_person_receive_password: {
        Args: {
          _admin_code: string
          _admin_password: string
          _display_name: string
          _new_password: string
        }
        Returns: boolean
      }
      generate_doc_number: { Args: never; Returns: string }
      peek_next_doc_number: { Args: never; Returns: string }
      person_exists: { Args: { _display_name: string }; Returns: boolean }
      set_department_password: {
        Args: {
          _admin_code: string
          _admin_password: string
          _department: string
          _new_password: string
        }
        Returns: boolean
      }
      verify_department_password: {
        Args: { _department: string; _password: string }
        Returns: boolean
      }
      verify_person_password: {
        Args: { _display_name: string; _password: string }
        Returns: boolean
      }
      verify_person_receive_password: {
        Args: { _display_name: string; _password: string }
        Returns: boolean
      }
      verify_role_login: {
        Args: { _password: string; _role_code: string }
        Returns: {
          display_name: string
          is_admin: boolean
          role_code: string
          step_access: number[]
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
