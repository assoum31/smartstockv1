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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          amount: number | null
          category: string
          created_at: string
          details: Json
          id: string
          ref: string | null
          sensitive: boolean
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string
          amount?: number | null
          category: string
          created_at?: string
          details?: Json
          id?: string
          ref?: string | null
          sensitive?: boolean
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          amount?: number | null
          category?: string
          created_at?: string
          details?: Json
          id?: string
          ref?: string | null
          sensitive?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_advances: {
        Row: {
          amount: number
          beneficiary_id: string | null
          beneficiary_name: string
          cash_session_id: string | null
          created_at: string
          created_by: string | null
          created_by_name: string
          id: string
          reason: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          beneficiary_id?: string | null
          beneficiary_name: string
          cash_session_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          id?: string
          reason?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          beneficiary_id?: string | null
          beneficiary_name?: string
          cash_session_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          id?: string
          reason?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_advances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          closed_at: string | null
          closing_amount: number | null
          id: string
          opened_at: string
          opened_by: string
          opened_by_name: string
          opening_amount: number
          status: string
          tenant_id: string
        }
        Insert: {
          closed_at?: string | null
          closing_amount?: number | null
          id?: string
          opened_at?: string
          opened_by: string
          opened_by_name: string
          opening_amount?: number
          status?: string
          tenant_id: string
        }
        Update: {
          closed_at?: string | null
          closing_amount?: number | null
          id?: string
          opened_at?: string
          opened_by?: string
          opened_by_name?: string
          opening_amount?: number
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          tenant_id: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          tenant_id?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          tenant_id?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipt_items: {
        Row: {
          barcode: string
          id: string
          product_name: string
          purchase_price: number
          quantity: number
          receipt_id: string
          selling_price: number
          tenant_id: string
        }
        Insert: {
          barcode: string
          id?: string
          product_name: string
          purchase_price?: number
          quantity: number
          receipt_id: string
          selling_price?: number
          tenant_id: string
        }
        Update: {
          barcode?: string
          id?: string
          product_name?: string
          purchase_price?: number
          quantity?: number
          receipt_id?: string
          selling_price?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string
          id: string
          notes: string | null
          receipt_number: number
          reference: string | null
          supplier_id: string | null
          supplier_name: string | null
          tenant_id: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name: string
          id?: string
          notes?: string | null
          receipt_number: number
          reference?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          tenant_id: string
          total_amount?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          id?: string
          notes?: string | null
          receipt_number?: number
          reference?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          tenant_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_logs: {
        Row: {
          audit_code: string | null
          audited_at: string | null
          audited_by: string | null
          audited_by_name: string | null
          barcode: string
          client_id: string | null
          counted_at: string
          counted_by: string | null
          counted_by_name: string
          counted_quantity: number
          id: string
          location: string | null
          notes: string | null
          product_name: string
          session_id: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          audit_code?: string | null
          audited_at?: string | null
          audited_by?: string | null
          audited_by_name?: string | null
          barcode: string
          client_id?: string | null
          counted_at?: string
          counted_by?: string | null
          counted_by_name: string
          counted_quantity?: number
          id?: string
          location?: string | null
          notes?: string | null
          product_name: string
          session_id?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          audit_code?: string | null
          audited_at?: string | null
          audited_by?: string | null
          audited_by_name?: string | null
          barcode?: string
          client_id?: string | null
          counted_at?: string
          counted_by?: string | null
          counted_by_name?: string
          counted_quantity?: number
          id?: string
          location?: string | null
          notes?: string | null
          product_name?: string
          session_id?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "inventory_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_sessions: {
        Row: {
          closed_at: string | null
          created_by: string | null
          id: string
          name: string
          started_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          closed_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          started_at?: string
          status?: string
          tenant_id: string
        }
        Update: {
          closed_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          started_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      online_order_items: {
        Row: {
          barcode: string
          id: string
          order_id: string
          product_name: string
          quantity: number
          tenant_id: string
          unit_price: number
        }
        Insert: {
          barcode: string
          id?: string
          order_id: string
          product_name: string
          quantity: number
          tenant_id: string
          unit_price: number
        }
        Update: {
          barcode?: string
          id?: string
          order_id?: string
          product_name?: string
          quantity?: number
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "online_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      online_orders: {
        Row: {
          created_at: string
          customer_name: string
          email: string | null
          handled_by_name: string | null
          id: string
          notes: string | null
          order_number: number
          phone: string
          status: string
          tenant_id: string
          total_amount: number
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          customer_name: string
          email?: string | null
          handled_by_name?: string | null
          id?: string
          notes?: string | null
          order_number?: number
          phone: string
          status?: string
          tenant_id: string
          total_amount?: number
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          customer_name?: string
          email?: string | null
          handled_by_name?: string | null
          id?: string
          notes?: string | null
          order_number?: number
          phone?: string
          status?: string
          tenant_id?: string
          total_amount?: number
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "online_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          alt_barcodes: string[]
          barcode: string
          carton_size: number
          created_at: string
          default_location: string | null
          famille: string | null
          id: string
          image_url: string | null
          min_stock: number
          model: string | null
          name: string
          online_description: string | null
          online_visible: boolean
          purchase_price: number
          related_barcodes: string[]
          selling_price: number
          system_quantity: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          alt_barcodes?: string[]
          barcode: string
          carton_size?: number
          created_at?: string
          default_location?: string | null
          famille?: string | null
          id?: string
          image_url?: string | null
          min_stock?: number
          model?: string | null
          name: string
          online_description?: string | null
          online_visible?: boolean
          purchase_price?: number
          related_barcodes?: string[]
          selling_price?: number
          system_quantity?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          alt_barcodes?: string[]
          barcode?: string
          carton_size?: number
          created_at?: string
          default_location?: string | null
          famille?: string | null
          id?: string
          image_url?: string | null
          min_stock?: number
          model?: string | null
          name?: string
          online_description?: string | null
          online_visible?: boolean
          purchase_price?: number
          related_barcodes?: string[]
          selling_price?: number
          system_quantity?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          must_activate: boolean
          tenant_id: string | null
          username: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          must_activate?: boolean
          tenant_id?: string | null
          username: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          must_activate?: boolean
          tenant_id?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recount_requests: {
        Row: {
          assigned_to: string | null
          barcode: string
          created_at: string
          done_at: string | null
          id: string
          log_id: string | null
          product_name: string
          requested_by: string | null
          requested_by_name: string
          session_id: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          assigned_to?: string | null
          barcode: string
          created_at?: string
          done_at?: string | null
          id?: string
          log_id?: string | null
          product_name: string
          requested_by?: string | null
          requested_by_name?: string
          session_id?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          assigned_to?: string | null
          barcode?: string
          created_at?: string
          done_at?: string | null
          id?: string
          log_id?: string | null
          product_name?: string
          requested_by?: string | null
          requested_by_name?: string
          session_id?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recount_requests_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "inventory_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recount_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "inventory_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recount_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_ticket_items: {
        Row: {
          barcode: string
          id: string
          product_name: string
          quantity: number
          session_id: string | null
          tenant_id: string
          ticket_id: string
          unit_price: number
        }
        Insert: {
          barcode: string
          id?: string
          product_name: string
          quantity: number
          session_id?: string | null
          tenant_id: string
          ticket_id: string
          unit_price?: number
        }
        Update: {
          barcode?: string
          id?: string
          product_name?: string
          quantity?: number
          session_id?: string | null
          tenant_id?: string
          ticket_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_ticket_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "inventory_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_ticket_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_ticket_items_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "sales_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_tickets: {
        Row: {
          cash_session_id: string | null
          created_at: string
          created_by: string | null
          created_by_name: string
          discount: number
          id: string
          notes: string | null
          online_order_id: string | null
          payment_method: string
          session_id: string | null
          tenant_id: string
          ticket_number: number
          total_amount: number
        }
        Insert: {
          cash_session_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name: string
          discount?: number
          id?: string
          notes?: string | null
          online_order_id?: string | null
          payment_method?: string
          session_id?: string | null
          tenant_id: string
          ticket_number: number
          total_amount?: number
        }
        Update: {
          cash_session_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          discount?: number
          id?: string
          notes?: string | null
          online_order_id?: string | null
          payment_method?: string
          session_id?: string | null
          tenant_id?: string
          ticket_number?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_tickets_online_order_id_fkey"
            columns: ["online_order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_tickets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "inventory_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      session_stock_snapshots: {
        Row: {
          barcode: string
          product_name: string
          session_id: string
          system_quantity: number
          tenant_id: string
        }
        Insert: {
          barcode: string
          product_name: string
          session_id: string
          system_quantity?: number
          tenant_id: string
        }
        Update: {
          barcode?: string
          product_name?: string
          session_id?: string
          system_quantity?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_stock_snapshots_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "inventory_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_stock_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_return_items: {
        Row: {
          barcode: string
          id: string
          product_name: string
          quantity: number
          return_id: string
          tenant_id: string
          unit_price: number
        }
        Insert: {
          barcode: string
          id?: string
          product_name: string
          quantity: number
          return_id: string
          tenant_id: string
          unit_price?: number
        }
        Update: {
          barcode?: string
          id?: string
          product_name?: string
          quantity?: number
          return_id?: string
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "stock_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_return_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_returns: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string
          id: string
          kind: string
          reason: string | null
          return_number: number
          supplier_id: string | null
          supplier_name: string | null
          tenant_id: string
          ticket_id: string | null
          ticket_ref: string | null
          total_amount: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name: string
          id?: string
          kind: string
          reason?: string | null
          return_number: number
          supplier_id?: string | null
          supplier_name?: string | null
          tenant_id: string
          ticket_id?: string | null
          ticket_ref?: string | null
          total_amount?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          id?: string
          kind?: string
          reason?: string | null
          return_number?: number
          supplier_id?: string | null
          supplier_name?: string | null
          tenant_id?: string
          ticket_id?: string | null
          ticket_ref?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_returns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_returns_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "sales_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          address: string | null
          ai: string | null
          company_name: string | null
          email: string | null
          invoice_footer: string | null
          label_height: number
          label_width: number
          logo: string | null
          nif: string | null
          nis: string | null
          phone: string | null
          rc: string | null
          store_banner: string | null
          store_color: string | null
          store_enabled: boolean
          store_logo: string | null
          store_tagline: string | null
          store_title: string | null
          tenant_id: string
          ticket_footer: string | null
          ticket_width: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          ai?: string | null
          company_name?: string | null
          email?: string | null
          invoice_footer?: string | null
          label_height?: number
          label_width?: number
          logo?: string | null
          nif?: string | null
          nis?: string | null
          phone?: string | null
          rc?: string | null
          store_banner?: string | null
          store_color?: string | null
          store_enabled?: boolean
          store_logo?: string | null
          store_tagline?: string | null
          store_title?: string | null
          tenant_id: string
          ticket_footer?: string | null
          ticket_width?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          ai?: string | null
          company_name?: string | null
          email?: string | null
          invoice_footer?: string | null
          label_height?: number
          label_width?: number
          logo?: string | null
          nif?: string | null
          nis?: string | null
          phone?: string | null
          rc?: string | null
          store_banner?: string | null
          store_color?: string | null
          store_enabled?: boolean
          store_logo?: string | null
          store_tagline?: string | null
          store_title?: string | null
          tenant_id?: string
          ticket_footer?: string | null
          ticket_width?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          tenant_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          tenant_id?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
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
      worker_activations: {
        Row: {
          attempts: number
          created_at: string
          expires_at: string
          pin_hash: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          expires_at: string
          pin_hash: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          expires_at?: string
          pin_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_activations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      session_variances: {
        Row: {
          barcode: string | null
          counted_quantity: number | null
          entries: number | null
          in_snapshot: boolean | null
          locations: string[] | null
          product_name: string | null
          session_id: string | null
          system_quantity: number | null
          tenant_id: string | null
          variance: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      audit_inventory_log: {
        Args: {
          _barcode: string
          _code: string
          _location: string
          _log_id: string
          _name: string
          _qty: number
        }
        Returns: undefined
      }
      can_sell: { Args: never; Returns: boolean }
      close_cash_session: {
        Args: { _closing: number; _id: string }
        Returns: undefined
      }
      close_inventory_session: {
        Args: { _session_id: string }
        Returns: undefined
      }
      complete_recount: {
        Args: {
          _barcode: string
          _location: string
          _name: string
          _notes: string
          _qty: number
          _req_id: string
        }
        Returns: undefined
      }
      create_cash_advance: {
        Args: { _amount: number; _beneficiary_id: string; _reason: string }
        Returns: string
      }
      create_goods_receipt: {
        Args: {
          _items: Json
          _notes?: string
          _reference?: string
          _supplier_id: string
        }
        Returns: string
      }
      create_sales_ticket: {
        Args: { _items: Json; _notes?: string; _session_id: string }
        Returns: string
      }
      create_stock_return: {
        Args: {
          _items: Json
          _kind: string
          _reason?: string
          _supplier_id?: string
          _ticket_ref?: string
        }
        Returns: string
      }
      create_ticket_return: {
        Args: { _items: Json; _reason?: string; _ticket_id: string }
        Returns: string
      }
      current_tenant_id: { Args: never; Returns: string }
      delete_goods_receipt: {
        Args: { _receipt_id: string }
        Returns: undefined
      }
      delete_sales_ticket: { Args: { _ticket_id: string }; Returns: undefined }
      deliver_online_order: {
        Args: { _order_id: string; _payment: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_store_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      import_sales_ticket: {
        Args: {
          _items: Json
          _notes?: string
          _session_id: string
          _sold_at?: string
        }
        Returns: string
      }
      is_manager: { Args: never; Returns: boolean }
      log_activity: {
        Args: {
          _action: string
          _amount: number
          _category: string
          _details: Json
          _ref: string
          _sensitive: boolean
          _tenant: string
        }
        Returns: undefined
      }
      next_audit_code: { Args: { _session_id: string }; Returns: string }
      open_cash_session: { Args: { _opening: number }; Returns: string }
      place_online_order: {
        Args: {
          _code: string
          _email: string
          _items: Json
          _name: string
          _notes: string
          _phone: string
          _whatsapp: string
        }
        Returns: number
      }
      public_store_catalog: {
        Args: { _code: string }
        Returns: {
          available: number
          barcode: string
          famille: string
          name: string
          selling_price: number
          store_name: string
        }[]
      }
      public_store_catalog_v2: {
        Args: { _code: string }
        Returns: {
          available: number
          barcode: string
          description: string
          famille: string
          image_url: string
          name: string
          related: string[]
          selling_price: number
        }[]
      }
      public_store_info: {
        Args: { _code: string }
        Returns: {
          address: string
          banner: string
          color: string
          enabled: boolean
          logo: string
          phone: string
          tagline: string
          title: string
        }[]
      }
      request_recount: { Args: { _log_id: string }; Returns: string }
      session_is_active: { Args: { _session_id: string }; Returns: boolean }
      set_product_alt_barcodes: {
        Args: { _alts: string[]; _barcode: string }
        Returns: string[]
      }
      set_product_prices: {
        Args: { _barcode: string; _purchase: number; _selling: number }
        Returns: undefined
      }
      set_product_second_barcode: {
        Args: { _barcode: string; _second: string }
        Returns: undefined
      }
      set_ticket_payment: {
        Args: { _discount: number; _payment: string; _ticket_id: string }
        Returns: undefined
      }
      start_inventory_session: { Args: { _name: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "master"
        | "manager"
        | "worker"
        | "cashier"
        | "pricer"
        | "observer"
        | "auditor"
        | "sales_manager"
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
  public: {
    Enums: {
      app_role: [
        "master",
        "manager",
        "worker",
        "cashier",
        "pricer",
        "observer",
        "auditor",
        "sales_manager",
      ],
    },
  },
} as const
