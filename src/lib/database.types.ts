export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18'
  }
  public: {
    Tables: {
      catalogue_changes: {
        Row: {
          created_at: string
          id: number
          isbn: string | null
          kind: string
          new_value: string | null
          old_value: string | null
          origin: string
          reverts_id: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          series_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          isbn?: string | null
          kind: string
          new_value?: string | null
          old_value?: string | null
          origin: string
          reverts_id?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          series_id?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          isbn?: string | null
          kind?: string
          new_value?: string | null
          old_value?: string | null
          origin?: string
          reverts_id?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          series_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'catalogue_changes_reverts_id_fkey'
            columns: ['reverts_id']
            isOneToOne: false
            referencedRelation: 'catalogue_changes'
            referencedColumns: ['id']
          },
        ]
      }
      collection_items: {
        Row: {
          acquired_on: string | null
          condition: string | null
          created_at: string
          dedication: string | null
          dedication_by: string | null
          first_edition: boolean
          id: string
          isbn: string
          notes: string | null
          price: number | null
          read: boolean
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          acquired_on?: string | null
          condition?: string | null
          created_at?: string
          dedication?: string | null
          dedication_by?: string | null
          first_edition?: boolean
          id?: string
          isbn: string
          notes?: string | null
          price?: number | null
          read?: boolean
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          acquired_on?: string | null
          condition?: string | null
          created_at?: string
          dedication?: string | null
          dedication_by?: string | null
          first_edition?: boolean
          id?: string
          isbn?: string
          notes?: string | null
          price?: number | null
          read?: boolean
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'collection_items_isbn_fkey'
            columns: ['isbn']
            isOneToOne: false
            referencedRelation: 'editions'
            referencedColumns: ['isbn']
          },
        ]
      }
      editions: {
        Row: {
          authors: string[]
          cover_locked: boolean
          cover_url: string | null
          created_at: string
          created_by: string | null
          isbn: string
          kind: string
          published_on: string | null
          publisher: string | null
          review_status: string
          series_id: string | null
          source: string | null
          title: string
          volume: number | null
          volume_from: number | null
          volume_to: number | null
        }
        Insert: {
          authors?: string[]
          cover_locked?: boolean
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          isbn: string
          kind?: string
          published_on?: string | null
          publisher?: string | null
          review_status?: string
          series_id?: string | null
          source?: string | null
          title: string
          volume?: number | null
          volume_from?: number | null
          volume_to?: number | null
        }
        Update: {
          authors?: string[]
          cover_locked?: boolean
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          isbn?: string
          kind?: string
          published_on?: string | null
          publisher?: string | null
          review_status?: string
          series_id?: string | null
          source?: string | null
          title?: string
          volume?: number | null
          volume_from?: number | null
          volume_to?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'editions_series_id_fkey'
            columns: ['series_id']
            isOneToOne: false
            referencedRelation: 'series'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          contribution: string
          created_at: string
          id: string
          pseudo: string
          role: string
          share_enabled: boolean
          share_token: string
        }
        Insert: {
          contribution?: string
          created_at?: string
          id: string
          pseudo: string
          role?: string
          share_enabled?: boolean
          share_token?: string
        }
        Update: {
          contribution?: string
          created_at?: string
          id?: string
          pseudo?: string
          role?: string
          share_enabled?: boolean
          share_token?: string
        }
        Relationships: []
      }
      series: {
        Row: {
          created_at: string
          id: string
          name: string
          name_key: string
          publication_status: string | null
          status_source: string
          total_checked_at: string | null
          total_source: string
          total_volumes: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          name_key: string
          publication_status?: string | null
          status_source?: string
          total_checked_at?: string | null
          total_source?: string
          total_volumes?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          name_key?: string
          publication_status?: string | null
          status_source?: string
          total_checked_at?: string | null
          total_source?: string
          total_volumes?: number | null
        }
        Relationships: []
      }
      user_series_settings: {
        Row: {
          ignored_volumes: number[]
          series_id: string
          status_override: string | null
          total_override: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ignored_volumes?: number[]
          series_id: string
          status_override?: string | null
          total_override?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ignored_volumes?: number[]
          series_id?: string
          status_override?: string | null
          total_override?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_series_settings_series_id_fkey'
            columns: ['series_id']
            isOneToOne: false
            referencedRelation: 'series'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_edition: {
        Args: {
          p_authors?: string[]
          p_cover_url?: string
          p_isbn: string
          p_published_on?: string
          p_publisher?: string
          p_series_name?: string
          p_source?: string
          p_title: string
          p_volume?: number
        }
        Returns: {
          authors: string[]
          cover_locked: boolean
          cover_url: string | null
          created_at: string
          created_by: string | null
          isbn: string
          published_on: string | null
          publisher: string | null
          review_status: string
          series_id: string | null
          source: string | null
          title: string
          volume: number | null
        }
        SetofOptions: {
          from: '*'
          to: 'editions'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_my_account: { Args: never; Returns: undefined }
      get_shared_collection: {
        Args: { p_token: string }
        Returns: {
          authors: string[]
          cover_url: string
          isbn: string
          pseudo: string
          series_name: string
          status: string
          title: string
          volume: number
        }[]
      }
      import_editions: { Args: { p_rows: Json }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_allowed_cover_url: {
        Args: { p_cover_url: string; p_isbn: string }
        Returns: boolean
      }
      is_moderator: { Args: never; Returns: boolean }
      is_valid_isbn13: { Args: { p_isbn: string }; Returns: boolean }
      isbn13_to_isbn10: { Args: { p_isbn: string }; Returns: string }
      list_catalogue_changes: {
        Args: {
          p_before?: number
          p_hide_job?: boolean
          p_limit?: number
          p_origin?: string
          p_status?: string
          p_user?: string
        }
        Returns: {
          created_at: string
          current_cover: string
          id: number
          isbn: string
          kind: string
          new_value: string
          old_value: string
          origin: string
          pseudo: string
          reverts_id: number
          reviewed_at: string
          reviewed_pseudo: string
          series_id: string
          series_name: string
          status: string
          title: string
          user_id: string
          volume: number
        }[]
      }
      list_users_admin: {
        Args: never
        Returns: {
          change_count: number
          collection_count: number
          contribution: string
          created_at: string
          id: string
          pending_count: number
          pseudo: string
          role: string
        }[]
      }
      regenerate_share_token: { Args: never; Returns: string }
      list_series_admin: {
        Args: { p_limit?: number; p_query?: string }
        Returns: {
          edition_count: number
          id: string
          name: string
          publication_status: string
          status_source: string
          total_source: string
          total_volumes: number
        }[]
      }
      rename_series: { Args: { p_name: string; p_series: string }; Returns: undefined }
      set_edition_kind: {
        Args: { p_from?: number; p_isbn: string; p_kind: string; p_to?: number }
        Returns: string
      }
      set_series_status: {
        Args: { p_series: string; p_status: string }
        Returns: undefined
      }
      set_series_total: {
        Args: { p_series: string; p_total: number }
        Returns: undefined
      }
      report_cover: {
        Args: { p_cover_url: string; p_isbn: string }
        Returns: string
      }
      revert_change: { Args: { p_id: number }; Returns: undefined }
      review_change: {
        Args: { p_accept: boolean; p_id: number }
        Returns: undefined
      }
      set_contribution_level: {
        Args: { p_level: string; p_user: string }
        Returns: undefined
      }
      set_edition_cover: {
        Args: { p_cover_url: string; p_isbn: string }
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
