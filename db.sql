CREATE EXTENSION "hstore";
CREATE EXTENSION "uuid-ossp";
BEGIN;
CREATE TABLE app_person (
    id integer NOT NULL,
    guid uuid NOT NULL,
    first_name character varying(30),
    last_name character varying(30),
    email character varying(75) NOT NULL,
    password character varying(128) NOT NULL,
    created timestamp with time zone NOT NULL,
    modified timestamp with time zone,
    last_login timestamp with time zone NOT NULL,
    details hstore
);
CREATE SEQUENCE app_person_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE app_person_id_seq OWNED BY app_person.id;
ALTER TABLE ONLY app_person ALTER COLUMN id SET DEFAULT nextval('app_person_id_seq'::regclass);
ALTER TABLE ONLY app_person
    ADD CONSTRAINT app_person_guid_key UNIQUE (guid);
ALTER TABLE ONLY app_person
    ADD CONSTRAINT app_person_pkey PRIMARY KEY (id);
CREATE INDEX app_person_email ON app_person USING btree (email);
CREATE INDEX app_person_guid ON app_person USING btree (guid);
CREATE TABLE app_request (
    id integer NOT NULL,
    guid uuid NOT NULL,
    requester_id integer NOT NULL,
    requester_guid uuid NOT NULL,
    requester_email character varying(75) NOT NULL,
    requested_id integer,
    requested_guid uuid,
    email character varying(75) NOT NULL,
    created timestamp with time zone NOT NULL,
    accepted timestamp with time zone,
    declined timestamp with time zone,
    cancelled timestamp with time zone,
    is_active boolean NOT NULL,
    details hstore
);
CREATE SEQUENCE app_request_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE app_request_id_seq OWNED BY app_request.id;
ALTER TABLE ONLY app_request ALTER COLUMN id SET DEFAULT nextval('app_request_id_seq'::regclass);
ALTER TABLE ONLY app_request
    ADD CONSTRAINT app_request_guid_key UNIQUE (guid);
ALTER TABLE ONLY app_request
    ADD CONSTRAINT app_request_pkey PRIMARY KEY (id);
CREATE INDEX app_request_by_for_active ON app_request USING btree (requester_guid, email, is_active);
CREATE INDEX app_request_details_gist ON app_request USING gist (details);
CREATE INDEX app_request_requested_id ON app_request USING btree (requested_id);
CREATE INDEX app_request_requester_id ON app_request USING btree (requester_id);
ALTER TABLE ONLY app_request
    ADD CONSTRAINT app_request_requested_id_fkey FOREIGN KEY (requested_id) REFERENCES app_person(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE ONLY app_request
    ADD CONSTRAINT app_request_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES app_person(id) DEFERRABLE INITIALLY DEFERRED;
COMMIT;
