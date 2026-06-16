--
-- PostgreSQL database dump
--

-- Dumped from database version 17.10 (98a80fa)
-- Dumped by pg_dump version 18.3

-- Started on 2026-06-14 08:30:13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 217 (class 1259 OID 24586)
-- Name: bots; Type: TABLE; Schema: public; Owner: db_bot_hostinger
--

CREATE TABLE public.bots (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name character varying(100),
    strategy character varying(50),
    symbol character varying(20) NOT NULL,
    stake numeric(10,2) NOT NULL,
    status character varying(20) DEFAULT 'stopped'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.bots OWNER TO db_bot_hostinger;

--
-- TOC entry 218 (class 1259 OID 24591)
-- Name: bots_id_seq; Type: SEQUENCE; Schema: public; Owner: db_bot_hostinger
--

CREATE SEQUENCE public.bots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bots_id_seq OWNER TO db_bot_hostinger;

--
-- TOC entry 3431 (class 0 OID 0)
-- Dependencies: 218
-- Name: bots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: db_bot_hostinger
--

ALTER SEQUENCE public.bots_id_seq OWNED BY public.bots.id;


--
-- TOC entry 227 (class 1259 OID 32769)
-- Name: deriv_accounts; Type: TABLE; Schema: public; Owner: db_bot_hostinger
--

CREATE TABLE public.deriv_accounts (
    id integer NOT NULL,
    user_id integer,
    account_name character varying(100),
    deriv_token text NOT NULL,
    currency character varying(10),
    balance numeric DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    account_id character varying(50)
);


ALTER TABLE public.deriv_accounts OWNER TO db_bot_hostinger;

--
-- TOC entry 226 (class 1259 OID 32768)
-- Name: deriv_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: db_bot_hostinger
--

CREATE SEQUENCE public.deriv_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.deriv_accounts_id_seq OWNER TO db_bot_hostinger;
--
-- TOC entry 3432 (class 0 OID 0)
-- Dependencies: 226
-- Name: deriv_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: db_bot_hostinger
--

ALTER SEQUENCE public.deriv_accounts_id_seq OWNED BY public.deriv_accounts.id;


--
-- TOC entry 219 (class 1259 OID 24592)
-- Name: logs; Type: TABLE; Schema: public; Owner: db_bot_hostinger
--

CREATE TABLE public.logs (
    id integer NOT NULL,
    user_id integer,
    message text,
    level character varying(10),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.logs OWNER TO db_bot_hostinger;

--
-- TOC entry 220 (class 1259 OID 24598)
-- Name: logs_id_seq; Type: SEQUENCE; Schema: public; Owner: db_bot_hostinger
--

CREATE SEQUENCE public.logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.logs_id_seq OWNER TO db_bot_hostinger;

--
-- TOC entry 3433 (class 0 OID 0)
-- Dependencies: 220
-- Name: logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: db_bot_hostinger
--

ALTER SEQUENCE public.logs_id_seq OWNED BY public.logs.id;


--
-- TOC entry 221 (class 1259 OID 24599)
-- Name: trades; Type: TABLE; Schema: public; Owner: db_bot_hostinger
--

CREATE TABLE public.trades (
    id integer NOT NULL,
    user_id integer,
    symbol text,
    contract_type text,
    profit numeric,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    bot_id integer,
    contract_id bigint,
    type character varying(10),
    entry_price numeric(10,5),
    exit_price numeric(10,5),
    status character varying(20)
);


ALTER TABLE public.trades OWNER TO db_bot_hostinger;

--
-- TOC entry 222 (class 1259 OID 24605)
-- Name: trades_id_seq; Type: SEQUENCE; Schema: public; Owner: db_bot_hostinger
--

CREATE SEQUENCE public.trades_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.trades_id_seq OWNER TO db_bot_hostinger;

--
-- TOC entry 3434 (class 0 OID 0)
-- Dependencies: 222
-- Name: trades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: db_bot_hostinger
--

ALTER SEQUENCE public.trades_id_seq OWNED BY public.trades.id;


--
-- TOC entry 223 (class 1259 OID 24606)
-- Name: user_stats; Type: VIEW; Schema: public; Owner: db_bot_hostinger
--

CREATE VIEW public.user_stats AS
 SELECT user_id,
    count(*) AS total_trades,
    sum(profit) AS total_profit,
    avg(profit) AS avg_profit
   FROM public.trades
  GROUP BY user_id;


ALTER VIEW public.user_stats OWNER TO db_bot_hostinger;

--
-- TOC entry 224 (class 1259 OID 24610)
-- Name: users; Type: TABLE; Schema: public; Owner: db_bot_hostinger
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    name character varying(100) NOT NULL,
    bot_active boolean DEFAULT false
);


ALTER TABLE public.users OWNER TO db_bot_hostinger;

--
-- TOC entry 225 (class 1259 OID 24617)
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: db_bot_hostinger
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO db_bot_hostinger;

--
-- TOC entry 3435 (class 0 OID 0)
-- Dependencies: 225
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: db_bot_hostinger
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- TOC entry 3234 (class 2604 OID 24618)
-- Name: bots id; Type: DEFAULT; Schema: public; Owner: db_bot_hostinger
--

ALTER TABLE ONLY public.bots ALTER COLUMN id SET DEFAULT nextval('public.bots_id_seq'::regclass);


--
-- TOC entry 3244 (class 2604 OID 32772)
-- Name: deriv_accounts id; Type: DEFAULT; Schema: public; Owner: db_bot_hostinger
--

ALTER TABLE ONLY public.deriv_accounts ALTER COLUMN id SET DEFAULT nextval('public.deriv_accounts_id_seq'::regclass);


--
-- TOC entry 3237 (class 2604 OID 24619)
-- Name: logs id; Type: DEFAULT; Schema: public; Owner: db_bot_hostinger
--

ALTER TABLE ONLY public.logs ALTER COLUMN id SET DEFAULT nextval('public.logs_id_seq'::regclass);


--
-- TOC entry 3239 (class 2604 OID 24620)
-- Name: trades id; Type: DEFAULT; Schema: public; Owner: db_bot_hostinger
--

ALTER TABLE ONLY public.trades ALTER COLUMN id SET DEFAULT nextval('public.trades_id_seq'::regclass);


--
-- TOC entry 3241 (class 2604 OID 24621)
-- Name: users id; Type: DEFAULT; Schema: public; Owner: db_bot_hostinger
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);
