# Pharmaceutical System Diagrams

## Sequence Diagram - Order Flow

```mermaid
sequenceDiagram
    participant P as Pharmacist
    participant S as System
    participant D as Distributor
    participant C as Company
    participant I as Inventory

    P->>S: Create Order (items, delivery address)
    S->>S: Group items by Company
    S->>S: Find Distributor by City
    S->>S: Calculate discounts from Promotions
    S->>S: Generate Order Number
    S->>D: Auto-assign Distributor
    S->>P: Order Created (pending)
    
    D->>S: View Pending Orders
    D->>S: Approve/Reject Order
    alt Approve
        S->>S: Update status to "approved"
        S->>P: Notification: Order Approved
        S->>D: Order ready for delivery
        D->>S: Mark as "in_delivery"
        S->>P: Notification: Order in Delivery
        D->>S: Mark as "delivered"
        S->>I: Deduct from Inventory
        S->>P: Notification: Order Delivered
    else Reject
        S->>S: Update status to "rejected"
        S->>P: Notification: Order Rejected
    end
```

## Sequence Diagram - Sample Request Flow

```mermaid
sequenceDiagram
    participant Dr as Doctor
    participant S as System
    participant C as Company
    participant R as Representative
    participant Q as Quota System

    Dr->>S: Request Sample (product, quantity)
    S->>Q: Check Sample Quota
    Q-->>S: Quota Available/Not Available
    alt Quota Available
        S->>S: Find Representative by City
        S->>R: Auto-assign Representative
        S->>C: Sample Request (pending)
        S->>Dr: Request Created
        
        C->>S: View Pending Requests
        C->>S: Approve/Reject Request
        alt Approve
            S->>S: Update status to "approved"
            S->>R: Notification: Request Approved
            S->>Dr: Notification: Request Approved
            R->>S: Mark as "delivered"
            S->>Dr: Notification: Sample Delivered
        else Reject
            S->>S: Update status to "rejected"
            S->>Dr: Notification: Request Rejected
        end
    else Quota Exceeded
        S->>Dr: Error: Quota exceeded
    end
```

## Activity Diagram - Overall System Flow

```mermaid
flowchart TD
    Start([Start]) --> Auth{Authentication}
    Auth -->|Success| RoleCheck{User Role}
    
    RoleCheck -->|Pharmacist| P1[View Products]
    P1 --> P2[Create Order]
    P2 --> P3[Auto-assign Distributor]
    P3 --> P4[Order Pending]
    P4 --> P5{Distributor Action}
    P5 -->|Approve| P6[Order Approved]
    P5 -->|Reject| P7[Order Rejected]
    P6 --> P8[In Delivery]
    P8 --> P9[Delivered]
    P9 --> End1([End])
    P7 --> End1
    
    RoleCheck -->|Doctor| D1[View Products]
    D1 --> D2[Request Sample]
    D2 --> D3[Check Quota]
    D3 -->|Available| D4[Auto-assign Representative]
    D3 -->|Exceeded| D5[Quota Error]
    D4 --> D6[Request Pending]
    D6 --> D7{Company Action}
    D7 -->|Approve| D8[Request Approved]
    D7 -->|Reject| D9[Request Rejected]
    D8 --> D10[Delivered]
    D10 --> End2([End])
    D9 --> End2
    D5 --> End2
    
    RoleCheck -->|Distributor| Dis1[View Assigned Orders]
    Dis1 --> Dis2{Order Status}
    Dis2 -->|Pending| Dis3[Approve/Reject]
    Dis2 -->|Approved| Dis4[Mark In Delivery]
    Dis2 -->|In Delivery| Dis5[Mark Delivered]
    Dis3 --> Dis6[Update Inventory]
    Dis5 --> Dis6
    Dis6 --> End3([End])
    
    RoleCheck -->|Company| C1[Manage Products]
    C1 --> C2[Create Promotions]
    C2 --> C3[Set Sample Quotas]
    C3 --> C4[View Sample Requests]
    C4 --> C5[Approve/Reject Requests]
    C5 --> End4([End])
    
    RoleCheck -->|Representative| R1[View Assigned Sample Requests]
    R1 --> R2[Deliver Samples]
    R2 --> End5([End])
```

## Key System Components

### 1. Order Management Flow
- **Pharmacist**: Creates order → System groups by company → Auto-assigns distributor → Order pending
- **Distributor**: Approves/rejects → Updates status → Delivers → Inventory deducted
- **Status Flow**: pending → approved → in_delivery → delivered OR pending → rejected/cancelled

### 2. Sample Request Flow  
- **Doctor**: Requests sample → Quota check → Auto-assigns representative → Request pending
- **Company**: Approves/rejects → Representative delivers
- **Quota System**: Monthly limits per doctor with cooldown periods

### 3. Promotion System
- **Company**: Creates promotions (percentage/buyXgetY) for distributors/pharmacists
- **Distributor**: Can clone and modify company promotions
- **Types**: Percentage discount or Buy X Get Y free

### 4. Inventory Management
- **Distributor**: Manages stock levels
- **Auto-deduction**: When orders are delivered
- **Low stock alerts**: When quantity falls below threshold

### 5. Auto-assignment Logic
- **Orders**: Distributor assigned based on pharmacist's city and company-distributor mapping
- **Sample Requests**: Representative assigned based on doctor's city and company-representative mapping

### 6. Notification System
- Order status updates
- Sample request updates  
- New promotions
- Low stock alerts
- Account status changes

## Database Relationships

```
Users → Profiles (Company/Distributor/Pharmacist/Doctor/Representative)
Company ↔ Distributor (Many-to-Many with City mapping)
Orders → Order Items → Products
Sample Requests → Products → Company
Promotions → Promotion Products OR BuyXGetY
Inventory → Products → Distributor
```

## Status Transitions

### Order Status:
- **pending**: Initial state
- **approved**: Distributor approved
- **in_delivery**: Being delivered
- **delivered**: Completed
- **rejected**: Distributor rejected
- **cancelled**: Pharmacist cancelled

### Sample Request Status:
- **pending**: Initial state
- **approved**: Company approved
- **delivered**: Representative delivered
- **rejected**: Company rejected or Doctor cancelled