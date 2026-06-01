use anyhow::Result;
use serde::Serialize;
use std::sync::Arc;
use tokio_postgres::Client;

#[derive(Debug, Serialize)]
pub struct SchemaInfo {
    pub name: String,
    pub owner: String,
}

#[derive(Debug, Serialize)]
pub struct TableInfo {
    pub schema: String,
    pub name: String,
    pub table_type: String, // "BASE TABLE" or "VIEW"
    pub row_estimate: i64,
    pub size: String,
}

#[derive(Debug, Serialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub column_default: Option<String>,
    pub is_primary_key: bool,
    pub is_foreign_key: bool,
    pub foreign_table: Option<String>,
    pub foreign_column: Option<String>,
    pub ordinal_position: i32,
}

#[derive(Debug, Serialize)]
pub struct DatabaseInfo {
    pub name: String,
    pub is_current: bool,
}

pub async fn get_databases(client: &Arc<Client>) -> Result<Vec<DatabaseInfo>> {
    let rows = client
        .query(
            "SELECT datname, datname = current_database() as is_current
             FROM pg_database
             WHERE datistemplate = false
             ORDER BY datname = current_database() DESC, datname",
            &[],
        )
        .await?;

    Ok(rows
        .iter()
        .map(|row| DatabaseInfo {
            name: row.get(0),
            is_current: row.get(1),
        })
        .collect())
}

pub async fn get_schemas(client: &Arc<Client>) -> Result<Vec<SchemaInfo>> {
    let rows = client
        .query(
            "SELECT schema_name, schema_owner
             FROM information_schema.schemata
             WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
             ORDER BY schema_name",
            &[],
        )
        .await?;

    Ok(rows
        .iter()
        .map(|row| SchemaInfo {
            name: row.get(0),
            owner: row.get(1),
        })
        .collect())
}

pub async fn get_tables(client: &Arc<Client>, schema: &str) -> Result<Vec<TableInfo>> {
    let rows = client
        .query(
            "SELECT
                t.table_schema,
                t.table_name,
                t.table_type,
                COALESCE(c.reltuples::bigint, 0) as row_estimate,
                COALESCE(pg_size_pretty(pg_total_relation_size(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))), '0 bytes') as size
             FROM information_schema.tables t
             LEFT JOIN pg_class c ON c.relname = t.table_name
             LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
             WHERE t.table_schema = $1
             ORDER BY t.table_name",
            &[&schema],
        )
        .await?;

    Ok(rows
        .iter()
        .map(|row| TableInfo {
            schema: row.get(0),
            name: row.get(1),
            table_type: row.get(2),
            row_estimate: row.get(3),
            size: row.get(4),
        })
        .collect())
}

pub async fn get_columns(
    client: &Arc<Client>,
    schema: &str,
    table: &str,
) -> Result<Vec<ColumnInfo>> {
    let rows = client
        .query(
            "SELECT
                c.column_name,
                c.data_type,
                c.is_nullable = 'YES' as is_nullable,
                c.column_default,
                COALESCE(pk.is_pk, false) as is_primary_key,
                COALESCE(fk.is_fk, false) as is_foreign_key,
                fk.foreign_table,
                fk.foreign_column,
                c.ordinal_position::int
             FROM information_schema.columns c
             LEFT JOIN (
                SELECT kcu.column_name, true as is_pk
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                    AND tc.table_schema = $1
                    AND tc.table_name = $2
             ) pk ON pk.column_name = c.column_name
             LEFT JOIN (
                SELECT
                    kcu.column_name,
                    true as is_fk,
                    ccu.table_name as foreign_table,
                    ccu.column_name as foreign_column
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                    ON ccu.constraint_name = tc.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema = $1
                    AND tc.table_name = $2
             ) fk ON fk.column_name = c.column_name
             WHERE c.table_schema = $1 AND c.table_name = $2
             ORDER BY c.ordinal_position",
            &[&schema, &table],
        )
        .await?;

    Ok(rows
        .iter()
        .map(|row| ColumnInfo {
            name: row.get(0),
            data_type: row.get(1),
            is_nullable: row.get(2),
            column_default: row.get(3),
            is_primary_key: row.get(4),
            is_foreign_key: row.get(5),
            foreign_table: row.get(6),
            foreign_column: row.get(7),
            ordinal_position: row.get(8),
        })
        .collect())
}

// ── Constraints ──

#[derive(Debug, Serialize)]
pub struct ConstraintInfo {
    pub name: String,
    pub constraint_type: String,
    pub columns: Vec<String>,
    pub definition: String,
    pub foreign_table: Option<String>,
    pub foreign_columns: Option<String>,
}

pub async fn get_constraints(
    client: &Arc<Client>,
    schema: &str,
    table: &str,
) -> Result<Vec<ConstraintInfo>> {
    let rows = client
        .query(
            "SELECT
                con.conname as name,
                CASE con.contype
                    WHEN 'p' THEN 'PRIMARY KEY'
                    WHEN 'f' THEN 'FOREIGN KEY'
                    WHEN 'u' THEN 'UNIQUE'
                    WHEN 'c' THEN 'CHECK'
                    WHEN 'x' THEN 'EXCLUSION'
                    ELSE con.contype::text
                END as constraint_type,
                COALESCE(
                    (SELECT array_agg(a.attname ORDER BY k.ord)
                     FROM unnest(con.conkey) WITH ORDINALITY AS k(col, ord)
                     JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.col),
                    ARRAY[]::text[]
                ) as columns,
                pg_get_constraintdef(con.oid, true) as definition,
                CASE WHEN con.contype = 'f'
                    THEN (SELECT nsp.nspname || '.' || rel.relname
                          FROM pg_class rel JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
                          WHERE rel.oid = con.confrelid)
                    ELSE NULL
                END as foreign_table,
                CASE WHEN con.contype = 'f'
                    THEN (SELECT string_agg(a.attname, ', ' ORDER BY k.ord)
                          FROM unnest(con.confkey) WITH ORDINALITY AS k(col, ord)
                          JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.col)
                    ELSE NULL
                END as foreign_columns
             FROM pg_constraint con
             JOIN pg_class c ON c.oid = con.conrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = $1 AND c.relname = $2
             ORDER BY con.contype, con.conname",
            &[&schema, &table],
        )
        .await?;

    Ok(rows
        .iter()
        .map(|row| {
            let cols: Vec<String> = row.get(2);
            ConstraintInfo {
                name: row.get(0),
                constraint_type: row.get(1),
                columns: cols,
                definition: row.get(3),
                foreign_table: row.get(4),
                foreign_columns: row.get(5),
            }
        })
        .collect())
}

// ── Indexes ──

#[derive(Debug, Serialize)]
pub struct IndexInfo {
    pub name: String,
    pub columns: String,
    pub is_unique: bool,
    pub is_primary: bool,
    pub index_type: String,
    pub definition: String,
    pub size: String,
}

pub async fn get_indexes(
    client: &Arc<Client>,
    schema: &str,
    table: &str,
) -> Result<Vec<IndexInfo>> {
    let rows = client
        .query(
            "SELECT
                i.relname as index_name,
                pg_get_indexdef(i.oid) as definition,
                ix.indisunique as is_unique,
                ix.indisprimary as is_primary,
                am.amname as index_type,
                COALESCE(pg_size_pretty(pg_relation_size(i.oid)), '0 bytes') as size,
                (SELECT string_agg(a.attname, ', ' ORDER BY k.ord)
                 FROM unnest(ix.indkey) WITH ORDINALITY AS k(col, ord)
                 JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.col
                 WHERE a.attnum > 0) as columns
             FROM pg_index ix
             JOIN pg_class i ON i.oid = ix.indexrelid
             JOIN pg_class t ON t.oid = ix.indrelid
             JOIN pg_namespace n ON n.oid = t.relnamespace
             JOIN pg_am am ON am.oid = i.relam
             WHERE n.nspname = $1 AND t.relname = $2
             ORDER BY i.relname",
            &[&schema, &table],
        )
        .await?;

    Ok(rows
        .iter()
        .map(|row| IndexInfo {
            name: row.get(0),
            definition: row.get(1),
            is_unique: row.get(2),
            is_primary: row.get(3),
            index_type: row.get(4),
            size: row.get(5),
            columns: row.get::<_, Option<String>>(6).unwrap_or_default(),
        })
        .collect())
}

// ── Triggers ──

#[derive(Debug, Serialize)]
pub struct TriggerInfo {
    pub name: String,
    pub event: String,
    pub timing: String,
    pub orientation: String,
    pub function_name: String,
    pub definition: String,
    pub enabled: bool,
}

pub async fn get_triggers(
    client: &Arc<Client>,
    schema: &str,
    table: &str,
) -> Result<Vec<TriggerInfo>> {
    let rows = client
        .query(
            "SELECT
                t.tgname as name,
                CASE
                    WHEN t.tgtype::int & 1 = 1 THEN 'ROW'
                    ELSE 'STATEMENT'
                END as orientation,
                CASE
                    WHEN t.tgtype::int & 2 = 2 THEN 'BEFORE'
                    WHEN t.tgtype::int & 64 = 64 THEN 'INSTEAD OF'
                    ELSE 'AFTER'
                END as timing,
                array_to_string(ARRAY[]::text[]
                    || CASE WHEN t.tgtype::int & 4 = 4 THEN 'INSERT' END
                    || CASE WHEN t.tgtype::int & 8 = 8 THEN 'DELETE' END
                    || CASE WHEN t.tgtype::int & 16 = 16 THEN 'UPDATE' END
                    || CASE WHEN t.tgtype::int & 32 = 32 THEN 'TRUNCATE' END,
                    ' OR ') as event,
                p.proname as function_name,
                pg_get_triggerdef(t.oid, true) as definition,
                t.tgenabled != 'D' as enabled
             FROM pg_trigger t
             JOIN pg_class c ON c.oid = t.tgrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
             JOIN pg_proc p ON p.oid = t.tgfoid
             WHERE n.nspname = $1 AND c.relname = $2
               AND NOT t.tgisinternal
             ORDER BY t.tgname",
            &[&schema, &table],
        )
        .await?;

    Ok(rows
        .iter()
        .map(|row| TriggerInfo {
            name: row.get(0),
            orientation: row.get(1),
            timing: row.get(2),
            event: row.get(3),
            function_name: row.get(4),
            definition: row.get(5),
            enabled: row.get(6),
        })
        .collect())
}

// ── Rules ──

#[derive(Debug, Serialize)]
pub struct RuleInfo {
    pub name: String,
    pub event: String,
    pub is_instead: bool,
    pub definition: String,
}

pub async fn get_rules(
    client: &Arc<Client>,
    schema: &str,
    table: &str,
) -> Result<Vec<RuleInfo>> {
    let rows = client
        .query(
            "SELECT
                r.rulename as name,
                CASE r.ev_type
                    WHEN '1' THEN 'SELECT'
                    WHEN '2' THEN 'UPDATE'
                    WHEN '3' THEN 'INSERT'
                    WHEN '4' THEN 'DELETE'
                    ELSE r.ev_type::text
                END as event,
                r.is_instead as is_instead,
                pg_get_ruledef(r.oid, true) as definition
             FROM pg_rewrite r
             JOIN pg_class c ON c.oid = r.ev_class
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = $1 AND c.relname = $2
               AND r.rulename != '_RETURN'
             ORDER BY r.rulename",
            &[&schema, &table],
        )
        .await?;

    Ok(rows
        .iter()
        .map(|row| RuleInfo {
            name: row.get(0),
            event: row.get(1),
            is_instead: row.get(2),
            definition: row.get(3),
        })
        .collect())
}

// ── RLS Policies ──

#[derive(Debug, Serialize)]
pub struct PolicyInfo {
    pub name: String,
    pub command: String,
    pub permissive: bool,
    pub roles: Vec<String>,
    pub using_expr: Option<String>,
    pub check_expr: Option<String>,
}

pub async fn get_policies(
    client: &Arc<Client>,
    schema: &str,
    table: &str,
) -> Result<Vec<PolicyInfo>> {
    let rows = client
        .query(
            "SELECT
                pol.polname as name,
                CASE pol.polcmd
                    WHEN 'r' THEN 'SELECT'
                    WHEN 'a' THEN 'INSERT'
                    WHEN 'w' THEN 'UPDATE'
                    WHEN 'd' THEN 'DELETE'
                    WHEN '*' THEN 'ALL'
                    ELSE pol.polcmd::text
                END as command,
                pol.polpermissive as permissive,
                COALESCE(
                    (SELECT array_agg(r.rolname)
                     FROM unnest(pol.polroles) AS role_oid
                     JOIN pg_roles r ON r.oid = role_oid),
                    ARRAY['PUBLIC']::text[]
                ) as roles,
                pg_get_expr(pol.polqual, pol.polrelid, true) as using_expr,
                pg_get_expr(pol.polwithcheck, pol.polrelid, true) as check_expr
             FROM pg_policy pol
             JOIN pg_class c ON c.oid = pol.polrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = $1 AND c.relname = $2
             ORDER BY pol.polname",
            &[&schema, &table],
        )
        .await?;

    Ok(rows
        .iter()
        .map(|row| {
            let roles: Vec<String> = row.get(3);
            PolicyInfo {
                name: row.get(0),
                command: row.get(1),
                permissive: row.get(2),
                roles,
                using_expr: row.get(4),
                check_expr: row.get(5),
            }
        })
        .collect())
}
