export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  travelbuddy_api: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account: { Args: never; Returns: Json }
      apply_payment_notification: {
        Args: {
          amount: number
          attempt_id: string
          currency: string
          payment_id: string
          status_code: string
        }
        Returns: undefined
      }
      availability: {
        Args: {
          day: string
          option_index?: number
          package_id: string
          travelers?: number
        }
        Returns: Json
      }
      begin_payment: {
        Args: { actor_id: string; order_id: string }
        Returns: Json
      }
      booking_chat: { Args: { booking_id: string }; Returns: string }
      bookings: { Args: never; Returns: Json }
      buddy_package: { Args: { package_id: string }; Returns: Json }
      buddy_packages: { Args: never; Returns: Json }
      buddy_profile: { Args: { profile_id: string }; Returns: Json }
      cancel_booking: { Args: { booking_id: string }; Returns: Json }
      cart: { Args: never; Returns: Json }
      catalog: { Args: { filters?: Json }; Returns: Json }
      checkout: { Args: { input: Json }; Returns: Json }
      claim_payment_refund: { Args: never; Returns: Json }
      commit_package_upload: {
        Args: { actor_id: string; input: Json }
        Returns: string
      }
      commit_profile_upload: {
        Args: { actor_id: string; expected_revision: number; input: Json }
        Returns: string
      }
      conversations: { Args: never; Returns: Json }
      expire_payment_holds: { Args: never; Returns: undefined }
      finish_payment_refund: {
        Args: { reference?: string; refund_id: string }
        Returns: undefined
      }
      mark_conversation_read: {
        Args: { conversation_id: string; through_message_id: string }
        Returns: undefined
      }
      media_path: { Args: { media_id: string }; Returns: string }
      messages: { Args: { conversation_id: string }; Returns: Json }
      nearby_areas: { Args: never; Returns: Json }
      nearby_live: { Args: { area_name: string }; Returns: Json }
      onboard: {
        Args: {
          account_type: string
          display_name: string
          expected_revision: number
        }
        Returns: Json
      }
      package_detail: { Args: { package_id: string }; Returns: Json }
      package_reservations: { Args: { package_id: string }; Returns: Json }
      payment_order: { Args: { order_id: string }; Returns: Json }
      provider_dashboard: { Args: { filters?: Json }; Returns: Json }
      provider_discovery: { Args: never; Returns: Json }
      provider_heartbeat: { Args: never; Returns: Json }
      save_buddy_package: {
        Args: { input: Json; package_id?: string }
        Returns: Json
      }
      save_meeting_point: { Args: { input: Json }; Returns: Json }
      save_profile: {
        Args: { expected_revision: number; input: Json }
        Returns: Json
      }
      search_suggestions: { Args: { query: string }; Returns: Json }
      send_message: {
        Args: { body: string; conversation_id: string }
        Returns: string
      }
      set_live_now: { Args: { live_now: boolean }; Returns: Json }
      set_profile_media: {
        Args: { expected_revision: number; input: Json }
        Returns: Json
      }
      set_provider_accepting: {
        Args: { accepting_requests: boolean }
        Returns: Json
      }
      start_chat: { Args: { package_id: string }; Returns: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  travelbuddy_api: {
    Enums: {},
  },
} as const
