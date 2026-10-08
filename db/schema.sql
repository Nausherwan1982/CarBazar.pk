-- DriveDeal.pk PostgreSQL Database Schema
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    cnic VARCHAR(15) UNIQUE NOT NULL,
    email VARCHAR(150),
    is_verified BOOLEAN DEFAULT FALSE,
    pta_sim_declared BOOLEAN DEFAULT TRUE,
    pta_declared_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    declaration_ip VARCHAR(50),
    free_ads_used_this_month INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE listings (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    make VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    variant VARCHAR(100),
    year INT NOT NULL,
    reg_year INT,
    price BIGINT NOT NULL,
    is_negotiable BOOLEAN DEFAULT TRUE,
    mileage INT NOT NULL,
    city VARCHAR(100) NOT NULL,
    registered_city VARCHAR(100),
    transmission VARCHAR(20) NOT NULL,
    fuel_type VARCHAR(20) NOT NULL,
    engine_cc INT NOT NULL,
    color VARCHAR(50),
    status VARCHAR(30) DEFAULT 'active',
    is_premium BOOLEAN DEFAULT FALSE,
    premium_expires_at TIMESTAMP WITH TIME ZONE,
    seller_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments (
    id VARCHAR(50) PRIMARY KEY,
    ad_id VARCHAR(50) REFERENCES listings(id),
    amount INT NOT NULL,
    purpose VARCHAR(50) NOT NULL,
    method VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    reference_no VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Storage used by server.ts (works with any Postgres; created automatically on start)
CREATE TABLE IF NOT EXISTS docs (kind TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL, PRIMARY KEY (kind, id));
