# Database Schema: program_data

**Host:** egghead.mysql.database.azure.com  
**Generated:** 2026-04-16  
**Total Tables:** 129  

## Table of Contents

- **Programs & Sessions** (12 tables)
  - [attendance](#attendance)
  - [curriculum_backup](#curriculum-backup)
  - [curriculum_backup_session](#curriculum-backup-session)
  - [program](#program)
  - [program_cut_type](#program-cut-type)
  - [program_grade](#program-grade)
  - [program_roster](#program-roster)
  - [program_session_pay](#program-session-pay)
  - [program_type](#program-type)
  - [session](#session)
  - [session_cancellation_log](#session-cancellation-log)
  - [session_roster](#session-roster)
- **Locations & Geography** (8 tables)
  - [city](#city)
  - [geographic_area](#geographic-area)
  - [location](#location)
  - [location_cut_type](#location-cut-type)
  - [location_type](#location-type)
  - [parking_difficulty](#parking-difficulty)
  - [region](#region)
  - [state](#state)
- **Classes & Lessons** (9 tables)
  - [class](#class)
  - [class_pricing_type](#class-pricing-type)
  - [class_status](#class-status)
  - [class_type](#class-type)
  - [default_grade](#default-grade)
  - [default_location_class_type](#default-location-class-type)
  - [lab_fee_type](#lab-fee-type)
  - [lesson](#lesson)
  - [lesson_class](#lesson-class)
- **Professors & Staff** (11 tables)
  - [availability](#availability)
  - [contractor](#contractor)
  - [evaluation_schedule](#evaluation-schedule)
  - [livescan](#livescan)
  - [observation_delete_reason](#observation-delete-reason)
  - [poc_title](#poc-title)
  - [professor](#professor)
  - [professor_evaluation](#professor-evaluation)
  - [professor_incident](#professor-incident)
  - [professor_observation](#professor-observation)
  - [professor_status](#professor-status)
- **Hiring & Onboarding** (17 tables)
  - [candidate](#candidate)
  - [candidate_applied_template](#candidate-applied-template)
  - [candidate_availability](#candidate-availability)
  - [candidate_document](#candidate-document)
  - [candidate_email](#candidate-email)
  - [candidate_message](#candidate-message)
  - [candidate_note](#candidate-note)
  - [candidate_requirement](#candidate-requirement)
  - [candidate_schedule](#candidate-schedule)
  - [candidate_task](#candidate-task)
  - [hiring_request](#hiring-request)
  - [hiring_request_program](#hiring-request-program)
  - [onboard_status](#onboard-status)
  - [onboarding_pay_entries](#onboarding-pay-entries)
  - [onboarding_requirement](#onboarding-requirement)
  - [onboarding_template](#onboarding-template)
  - [onboarding_template_item](#onboarding-template-item)
- **Parties & Events** (10 tables)
  - [camp_coordinator_kit](#camp-coordinator-kit)
  - [camp_curriculum](#camp-curriculum)
  - [demo_type](#demo-type)
  - [party_assignment_ask](#party-assignment-ask)
  - [party_email_log](#party-email-log)
  - [party_email_template](#party-email-template)
  - [party_format](#party-format)
  - [party_kit_type](#party-kit-type)
  - [party_session_pay](#party-session-pay)
  - [party_shipment](#party-shipment)
- **Students & Parents** (5 tables)
  - [grade](#grade)
  - [parent](#parent)
  - [parent_role](#parent-role)
  - [student](#student)
  - [student_parent](#student-parent)
- **Payroll & Pay** (11 tables)
  - [field_manager_payroll_rocketology](#field-manager-payroll-rocketology)
  - [field_manager_time_entries](#field-manager-time-entries)
  - [gusto_employee_codes](#gusto-employee-codes)
  - [mileage_daily_entries](#mileage-daily-entries)
  - [mileage_submissions](#mileage-submissions)
  - [mileage_weeks](#mileage-weeks)
  - [misc_pay_entries](#misc-pay-entries)
  - [payroll_runs_pes](#payroll-runs-pes)
  - [payroll_runs_rocketology](#payroll-runs-rocketology)
  - [payroll_summary_pes](#payroll-summary-pes)
  - [payroll_summary_rocketology](#payroll-summary-rocketology)
- **Invoicing & Billing** (7 tables)
  - [contract_permit_required](#contract-permit-required)
  - [cut_type](#cut-type)
  - [invoice_payment](#invoice-payment)
  - [invoice_record](#invoice-record)
  - [invoice_record_program](#invoice-record-program)
  - [our_cut_type](#our-cut-type)
  - [qb_token](#qb-token)
- **Shipping & Materials** (9 tables)
  - [bin](#bin)
  - [has_bin](#has-bin)
  - [mapping_id](#mapping-id)
  - [shipment_cycle](#shipment-cycle)
  - [shipment_exclusion_rule](#shipment-exclusion-rule)
  - [shipment_order](#shipment-order)
  - [shipment_order_line](#shipment-order-line)
  - [shipment_resolution](#shipment-resolution)
  - [stock_level](#stock-level)
- **Users, Roles & Access** (10 tables)
  - [report](#report)
  - [report_field_config](#report-field-config)
  - [report_role](#report-role)
  - [report_user](#report-user)
  - [role](#role)
  - [tool](#tool)
  - [tool_role](#tool-role)
  - [user](#user)
  - [user_column_preference](#user-column-preference)
  - [user_responsibility](#user-responsibility)
- **Notifications & Comms** (5 tables)
  - [client_email_log](#client-email-log)
  - [email_template](#email-template)
  - [notification_log](#notification-log)
  - [sms_template](#sms-template)
  - [twilio_response](#twilio-response)
- **HR & Compliance** (10 tables)
  - [audit_log](#audit-log)
  - [bug_report](#bug-report)
  - [day_off](#day-off)
  - [holiday](#holiday)
  - [incident](#incident)
  - [incident_note](#incident-note)
  - [incident_report](#incident-report)
  - [review](#review)
  - [sub_claim](#sub-claim)
  - [substitute_reason](#substitute-reason)
- **System & Config** (5 tables)
  - [app_setting](#app-setting)
  - [app_settings](#app-settings)
  - [nightly_job_logs](#nightly-job-logs)
  - [system_setting](#system-setting)
  - [weekday](#weekday)

---

# Programs & Sessions

## attendance

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `session_id` | `int` | NO | MUL | `NULL` |
| `student_id` | `int` | NO | MUL | `NULL` |
| `status` | `enum('present','absent','late','excused')` | NO |  | `present` |
| `notes` | `varchar(255)` | YES |  | `NULL` |
| `marked_by` | `int` | YES |  | `NULL` |
| `marked_at` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |
| `created_at` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `session_id` → `session.id` *(attendance_ibfk_1)*
- `student_id` → `student.id` *(attendance_ibfk_2)*

## curriculum_backup

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `backup_label` | `varchar(255)` | NO |  | `NULL` |
| `created_by_user_id` | `int` | YES |  | `NULL` |
| `created_at` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |

## curriculum_backup_session

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `backup_id` | `int` | NO |  | `NULL` |
| `session_id` | `int` | NO |  | `NULL` |
| `previous_lesson_id` | `int` | YES |  | `NULL` |
| `new_lesson_id` | `int` | YES |  | `NULL` |

## program

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `program_nickname` | `char(255)` | NO | UNI | `NULL` |
| `class_status_id` | `int` | YES | MUL | `NULL` |
| `location_id` | `int` | YES | MUL | `NULL` |
| `live` | `tinyint(1)` | NO |  | `1` |
| `class_id` | `int` | YES | MUL | `NULL` |
| `grade_range` | `varchar(32)` | YES |  | `NULL` |
| `start_time` | `time` | YES |  | `NULL` |
| `class_length_minutes` | `int` | YES |  | `NULL` |
| `monday` | `tinyint(1)` | NO |  | `0` |
| `tuesday` | `tinyint(1)` | NO |  | `0` |
| `wednesday` | `tinyint(1)` | NO |  | `0` |
| `thursday` | `tinyint(1)` | NO |  | `0` |
| `friday` | `tinyint(1)` | NO |  | `0` |
| `saturday` | `tinyint(1)` | NO |  | `0` |
| `sunday` | `tinyint(1)` | NO |  | `0` |
| `general_notes` | `varchar(1024)` | YES |  | `NULL` |
| `parent_cost` | `decimal(10,2)` | YES |  | `NULL` |
| `our_cut` | `decimal(10,2)` | YES |  | `NULL` |
| `lab_fee` | `decimal(10,2)` | YES |  | `NULL` |
| `number_enrolled` | `int` | YES |  | `NULL` |
| `session_count` | `int` | NO |  | `0` |
| `minimum_students` | `int` | YES |  | `NULL` |
| `maximum_students` | `int` | YES |  | `NULL` |
| `roster_received` | `tinyint(1)` | NO |  | `0` |
| `roster_confirmed` | `tinyint(1)` | NO |  | `0` |
| `roster_notes` | `varchar(1024)` | YES |  | `NULL` |
| `degrees_printed` | `varchar(64)` | YES |  | `NULL` |
| `payment_through_us` | `tinyint(1)` | NO |  | `0` |
| `invoice_date_sent` | `date` | YES |  | `NULL` |
| `invoice_paid` | `tinyint(1)` | NO |  | `0` |
| `invoice_notes` | `varchar(1024)` | YES |  | `NULL` |
| `contract_permit_required_id` | `int` | YES | MUL | `NULL` |
| `special_info_required` | `varchar(1024)` | YES |  | `NULL` |
| `lead_professor_id` | `int` | YES | MUL | `NULL` |
| `lead_professor_pay` | `decimal(10,2)` | YES |  | `NULL` |
| `tb_required` | `tinyint(1)` | NO |  | `0` |
| `livescan_required` | `tinyint(1)` | NO |  | `0` |
| `virtus_required` | `tinyint(1)` | NO |  | `0` |
| `roster_link` | `varchar(1024)` | YES |  | `NULL` |
| `demo_required` | `tinyint(1)` | NO |  | `0` |
| `demo_date` | `date` | YES |  | `NULL` |
| `demo_start_time` | `time` | YES |  | `NULL` |
| `demo_end_time` | `time` | YES |  | `NULL` |
| `demo_type_id` | `int` | YES | MUL | `NULL` |
| `demo_pay` | `int` | YES |  | `NULL` |
| `demo_professor_id` | `int` | YES | MUL | `NULL` |
| `demo_notes` | `varchar(1024)` | YES |  | `NULL` |
| `flyer_required` | `tinyint(1)` | NO |  | `0` |
| `flyer_made` | `date` | YES |  | `NULL` |
| `flyer_sent_electronic` | `date` | YES |  | `NULL` |
| `flyer_dropped_physical` | `date` | YES |  | `NULL` |
| `flyer_dropped_physical_notes` | `varchar(1024)` | YES |  | `NULL` |
| `registration_opened_online` | `date` | YES |  | `NULL` |
| `open_blast_sent` | `tinyint(1)` | NO |  | `0` |
| `open_blast_sent_notes` | `varchar(1024)` | YES |  | `NULL` |
| `two_week_blast_sent` | `tinyint(1)` | NO |  | `0` |
| `two_week_blast_sent_notes` | `varchar(1024)` | YES |  | `NULL` |
| `one_week_blast_sent` | `tinyint(1)` | NO |  | `0` |
| `one_week_blast_sent_notes` | `varchar(1024)` | YES |  | `NULL` |
| `final_blast_sent` | `tinyint(1)` | NO |  | `0` |
| `final_blast_sent_notes` | `varchar(1024)` | YES |  | `NULL` |
| `parent_feedback_requested` | `tinyint(1)` | NO |  | `0` |
| `parent_id` | `int` | YES | MUL | `NULL` |
| `shirt_size` | `char(64)` | YES |  | `NULL` |
| `glow_slime_amount_needed` | `int` | YES |  | `NULL` |
| `calendar_event` | `varchar(1024)` | YES |  | `NULL` |
| `materials_prepared` | `int` | YES |  | `NULL` |
| `details_confirmed` | `date` | YES |  | `NULL` |
| `invoice_needed` | `tinyint(1)` | YES |  | `0` |
| `how_heard` | `char(32)` | YES |  | `NULL` |
| `lead_professor_drive_fee` | `decimal(10,2)` | YES |  | `NULL` |
| `lead_professor_tip` | `decimal(10,2)` | YES |  | `NULL` |
| `lead_professor_dry_ice` | `decimal(10,2)` | YES |  | `NULL` |
| `lead_reimbursements_paid` | `tinyint(1)` | YES |  | `0` |
| `assistant_required` | `tinyint(1)` | YES |  | `0` |
| `assistant_professor_id` | `int` | YES | MUL | `NULL` |
| `assistant_professor_pay` | `decimal(10,2)` | YES |  | `NULL` |
| `assistant_professor_drive_fee` | `decimal(10,2)` | YES |  | `NULL` |
| `assistant_professor_tip` | `decimal(10,2)` | YES |  | `NULL` |
| `assistant_professor_dry_ice` | `decimal(10,2)` | YES |  | `NULL` |
| `assistant_reimbursements_paid` | `tinyint(1)` | YES |  | `0` |
| `base_party_price` | `decimal(10,2)` | YES |  | `NULL` |
| `drive_fee` | `decimal(10,2)` | YES |  | `NULL` |
| `late_booking_fee` | `decimal(10,2)` | YES |  | `NULL` |
| `total_kids_attended` | `int` | YES |  | `NULL` |
| `extra_kids_fee` | `decimal(10,2)` | YES |  | `NULL` |
| `extra_time_fee` | `decimal(10,2)` | YES |  | `NULL` |
| `deposit_date` | `date` | YES |  | `NULL` |
| `deposit_amount` | `decimal(10,2)` | YES |  | `NULL` |
| `total_party_cost` | `decimal(10,2)` | YES |  | `NULL` |
| `emailed_follow_up` | `date` | YES |  | `NULL` |
| `charge_confirmed` | `tinyint(1)` | YES |  | `0` |
| `final_charge_date` | `date` | YES |  | `NULL` |
| `final_charge_type` | `varchar(1024)` | YES |  | `NULL` |
| `expected_margin` | `decimal(8,4)` | YES |  | `NULL` |
| `first_session_date` | `date` | YES |  | `NULL` |
| `last_session_date` | `date` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |
| `party_format_id` | `int` | YES |  | `NULL` |
| `party_location_text` | `varchar(255)` | YES |  | `NULL` |
| `party_confirmation_sent` | `tinyint(1)` | YES |  | `0` |
| `party_confirmation_sent_at` | `datetime` | YES |  | `NULL` |
| `party_confirmation_sent_by` | `int` | YES |  | `NULL` |
| `birthday_kid_name` | `varchar(128)` | YES |  | `NULL` |
| `birthday_kid_age` | `tinyint` | YES |  | `NULL` |
| `calendar_event_id` | `varchar(255)` | YES |  | `NULL` |
| `qb_invoice_id` | `varchar(50)` | YES |  | `NULL` |
| `qb_invoice_number` | `varchar(20)` | YES |  | `NULL` |
| `qb_invoice_status` | `varchar(30)` | YES |  | `NULL` |
| `qb_invoice_balance` | `decimal(10,2)` | YES |  | `NULL` |

**Foreign Keys:**

- `assistant_professor_id` → `professor.id` *(program_assistant_professor)*
- `class_id` → `class.id` *(program_class)*
- `class_status_id` → `class_status.id` *(program_class_status)*
- `contract_permit_required_id` → `contract_permit_required.id` *(program_contract_permit_required)*
- `demo_professor_id` → `professor.id` *(program_demo_professor)*
- `demo_type_id` → `demo_type.id` *(program_demo_type)*
- `lead_professor_id` → `professor.id` *(program_lead_professor)*
- `location_id` → `location.id` *(program_location)*
- `parent_id` → `parent.id` *(program_parent)*

## program_cut_type

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `program_id` | `int` | NO | MUL | `NULL` |
| `our_cut_type_id` | `int` | NO | MUL | `NULL` |
| `amount` | `decimal(10,2)` | YES |  | `NULL` |
| `description` | `char(255)` | YES |  | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

**Foreign Keys:**

- `our_cut_type_id` → `our_cut_type.id` *(program_cut_type_our_cut_type)*
- `program_id` → `program.id` *(program_cut_type_program)*

## program_grade

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `program_id` | `int` | NO | MUL | `NULL` |
| `grade_id` | `int` | NO | MUL | `NULL` |
| `age_min` | `decimal(3,1)` | YES |  | `NULL` |
| `age_max` | `decimal(3,1)` | YES |  | `NULL` |

**Foreign Keys:**

- `grade_id` → `grade.id` *(program_grade_grade)*
- `program_id` → `program.id` *(program_grade_program)*

## program_roster

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `program_id` | `int` | NO | MUL | `NULL` |
| `student_id` | `int` | NO | MUL | `NULL` |
| `grade_id` | `int` | YES | MUL | `NULL` |
| `age` | `int` | YES |  | `NULL` |
| `gender` | `char(4)` | YES |  | `NULL` |
| `date_applied` | `date` | NO |  | `NULL` |
| `date_dropped` | `date` | YES |  | `NULL` |
| `weeks_attended` | `int` | YES |  | `NULL` |
| `student_lab_fee` | `char(255)` | YES |  | `NULL` |
| `notes` | `char(255)` | YES |  | `NULL` |
| `pending_approval` | `tinyint(1)` | NO |  | `0` |
| `added_by_user_id` | `int` | YES |  | `NULL` |
| `approved_by_user_id` | `int` | YES |  | `NULL` |
| `approved_at` | `datetime` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |

**Foreign Keys:**

- `grade_id` → `grade.id` *(program_roster_grade)*
- `program_id` → `program.id` *(program_roster_program)*
- `student_id` → `student.id` *(program_roster_student)*

## program_session_pay

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `program_id` | `int` | NO | MUL | `NULL` |
| `session_id` | `int` | YES |  | `NULL` |
| `session_date` | `date` | NO | MUL | `NULL` |
| `lesson_name` | `varchar(200)` | YES |  | `NULL` |
| `role` | `enum('Lead','Assistant')` | NO |  | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `is_substitute` | `tinyint(1)` | NO |  | `0` |
| `pay_amount` | `decimal(8,2)` | NO |  | `0.00` |
| `pay_source` | `enum('special_date','location_base','professor_base','manual','session')` | NO |  | `NULL` |
| `assist_pay_flag` | `enum('OK','MISSING')` | NO | MUL | `OK` |
| `class_hours` | `decimal(4,2)` | NO |  | `NULL` |
| `regular_pay_component` | `decimal(8,2)` | NO |  | `NULL` |
| `bonus_component` | `decimal(8,2)` | NO |  | `NULL` |
| `reimbursement_amount` | `decimal(8,2)` | NO |  | `0.00` |
| `generated_by` | `enum('nightly_job','manual')` | NO |  | `nightly_job` |
| `edited_at` | `datetime` | YES |  | `NULL` |
| `edited_by` | `varchar(100)` | YES |  | `NULL` |
| `created_at` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `program_id` → `program.id` *(program_session_pay_ibfk_1)*
- `professor_id` → `professor.id` *(program_session_pay_ibfk_2)*

## program_type

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `program_type_name` | `char(64)` | NO | UNI | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## session

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `program_id` | `int` | NO | MUL | `NULL` |
| `lesson_id` | `int` | YES | MUL | `NULL` |
| `no_lesson_taught` | `tinyint(1)` | NO |  | `0` |
| `professor_id` | `int` | YES | MUL | `NULL` |
| `professor_pay` | `decimal(10,2)` | YES |  | `NULL` |
| `assistant_id` | `int` | YES | MUL | `NULL` |
| `assistant_pay` | `decimal(10,2)` | YES |  | `NULL` |
| `session_date` | `date` | NO |  | `NULL` |
| `session_time` | `time` | YES |  | `NULL` |
| `specific_notes` | `varchar(1024)` | YES |  | `NULL` |
| `not_billed` | `tinyint(1)` | NO |  | `0` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |
| `professor_confirmed` | `tinyint(1)` | YES |  | `0` |
| `professor_confirmed_at` | `datetime` | YES |  | `NULL` |
| `notification_sent` | `tinyint(1)` | YES |  | `0` |
| `notification_sent_at` | `datetime` | YES |  | `NULL` |

**Foreign Keys:**

- `assistant_id` → `professor.id` *(session_assistant)*
- `lesson_id` → `lesson.id` *(session_lesson)*
- `professor_id` → `professor.id` *(session_professor)*
- `program_id` → `program.id` *(session_program)*

## session_cancellation_log

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `session_id` | `int` | NO |  | `NULL` |
| `program_id` | `int` | NO | MUL | `NULL` |
| `session_date` | `date` | YES | MUL | `NULL` |
| `reason` | `enum('staffing','client','holiday','schedule_change','other')` | YES | MUL | `other` |
| `notes` | `varchar(255)` | YES |  | `NULL` |
| `cancelled_by_user_id` | `int` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |

## session_roster

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `session_id` | `int` | NO | MUL | `NULL` |
| `program_roster_id` | `int` | NO | MUL | `NULL` |
| `notes` | `char(255)` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |

**Foreign Keys:**

- `program_roster_id` → `program_roster.id` *(session_roster_program_roster)*
- `session_id` → `session.id` *(session_roster_session)*

# Locations & Geography

## city

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `city_name` | `char(64)` | NO | MUL | `NULL` |
| `zip_code` | `char(16)` | NO | UNI | `NULL` |
| `state_id` | `int` | NO | MUL | `NULL` |
| `geographic_area_id` | `int` | NO | MUL | `NULL` |

**Foreign Keys:**

- `geographic_area_id` → `geographic_area.id` *(city_geographic_area)*
- `state_id` → `state.id` *(city_state)*

## geographic_area

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `geographic_area_name` | `char(64)` | NO | UNI | `NULL` |
| `scheduling_coordinator_user_id` | `int` | YES | MUL | `NULL` |
| `field_manager_user_id` | `int` | YES | MUL | `NULL` |
| `client_manager_user_id` | `int` | YES | MUL | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |
| `sales_user_id` | `int` | YES |  | `NULL` |
| `recruiter_user_id` | `int` | YES |  | `NULL` |
| `onboarder_user_id` | `int` | YES |  | `NULL` |
| `client_specialist_user_id` | `int` | YES |  | `NULL` |
| `scheduling_specialist_user_id` | `int` | YES |  | `NULL` |
| `trainer_user_id` | `int` | YES |  | `NULL` |
| `region_id` | `int` | YES |  | `NULL` |
| `state_id` | `int` | YES |  | `NULL` |
| `base_pay_rate` | `decimal(8,2)` | YES |  | `NULL` |
| `party_pay_rate` | `decimal(8,2)` | YES |  | `65.00` |
| `assist_pay_rate` | `decimal(8,2)` | YES |  | `NULL` |
| `pickup_pay_rate` | `decimal(8,2)` | YES |  | `NULL` |
| `camp_pay_rate` | `decimal(8,2)` | YES |  | `NULL` |
| `shipping_lead_days` | `int` | NO |  | `7` |

**Foreign Keys:**

- `client_manager_user_id` → `user.id` *(geographic_area_user_cm)*
- `field_manager_user_id` → `user.id` *(geographic_area_user_fm)*
- `scheduling_coordinator_user_id` → `user.id` *(geographic_area_user_sc)*

## location

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `nickname` | `char(128)` | NO | UNI | `NULL` |
| `school_name` | `char(128)` | NO |  | `NULL` |
| `payment_through_us` | `tinyint(1)` | NO |  | `NULL` |
| `location_type_id` | `int` | YES | MUL | `NULL` |
| `location_phone` | `char(32)` | NO |  | `NULL` |
| `address` | `char(128)` | NO |  | `NULL` |
| `city_id` | `int` | YES | MUL | `NULL` |
| `geographic_area_id_online` | `int` | YES | MUL | `NULL` |
| `point_of_contact` | `varchar(256)` | YES |  | `NULL` |
| `poc_title_id` | `int` | YES | MUL | `NULL` |
| `poc_title` | `varchar(128)` | YES |  | `NULL` |
| `poc_phone` | `char(128)` | YES |  | `NULL` |
| `poc_email` | `char(128)` | YES |  | `NULL` |
| `contractor_id` | `int` | YES | MUL | `NULL` |
| `location_enrollment` | `int` | YES |  | `NULL` |
| `demo_allowed` | `tinyint(1)` | YES |  | `NULL` |
| `demo_type_id` | `int` | YES | MUL | `NULL` |
| `demo_pay` | `int` | YES |  | `NULL` |
| `demo_notes` | `varchar(1024)` | YES |  | `NULL` |
| `class_pricing_type_id` | `int` | YES | MUL | `NULL` |
| `school_cut_type` | `enum('percentage','weekly_fixed','session_fixed','student_per_session','student_per_week','subsidy_percentage')` | YES |  | `NULL` |
| `school_cut_value` | `decimal(10,2)` | YES |  | `NULL` |
| `school_cut_notes` | `varchar(512)` | YES |  | `NULL` |
| `virtus_required` | `tinyint(1)` | NO |  | `NULL` |
| `tb_required` | `tinyint(1)` | NO |  | `NULL` |
| `livescan_required` | `tinyint(1)` | NO |  | `NULL` |
| `livescan_info` | `varchar(1024)` | YES |  | `NULL` |
| `contract_permit_required` | `tinyint(1)` | NO |  | `NULL` |
| `contract_permit_notes` | `char(255)` | YES |  | `NULL` |
| `special_info_required` | `char(255)` | YES |  | `NULL` |
| `flyer_required` | `tinyint(1)` | NO |  | `NULL` |
| `registration_link_for_flyer` | `varchar(1024)` | YES |  | `NULL` |
| `custom_flyer_required` | `tinyint(1)` | NO |  | `NULL` |
| `custom_flyer_items_required` | `varchar(1024)` | YES |  | `NULL` |
| `flyer_quantity` | `int` | YES |  | `NULL` |
| `parking_difficulty_id` | `int` | YES | MUL | `NULL` |
| `parking_information` | `varchar(1024)` | YES |  | `NULL` |
| `school_procedure_Info` | `varchar(1024)` | YES |  | `NULL` |
| `internal_notes` | `varchar(1024)` | YES |  | `NULL` |
| `observes_allowed` | `tinyint(1)` | YES |  | `NULL` |
| `jewish` | `tinyint(1)` | YES |  | `NULL` |
| `set_dates_ourselves` | `tinyint(1)` | YES |  | `NULL` |
| `number_of_weeks` | `int` | YES |  | `NULL` |
| `school_calendar_link` | `varchar(1024)` | YES |  | `NULL` |
| `invoicing_notes` | `varchar(1024)` | YES |  | `NULL` |
| `invoice_type` | `enum('Monthly','2nd Week','After Last Class')` | YES |  | `NULL` |
| `tbd` | `tinyint(1)` | NO |  | `NULL` |
| `tbd_notes` | `varchar(1024)` | YES |  | `NULL` |
| `retained` | `tinyint(1)` | NO |  | `0` |
| `client_manager_user_id` | `int` | YES |  | `NULL` |
| `site_coordinator_name` | `varchar(128)` | YES |  | `NULL` |
| `site_coordinator_email` | `varchar(256)` | YES |  | `NULL` |
| `site_coordinator_phone` | `varchar(64)` | YES |  | `NULL` |
| `site_coordinator_role` | `varchar(128)` | YES |  | `NULL` |
| `invoice_contact_name` | `varchar(128)` | YES |  | `NULL` |
| `invoice_contact_email` | `varchar(256)` | YES |  | `NULL` |
| `invoice_contact_phone` | `varchar(64)` | YES |  | `NULL` |
| `invoice_at_district` | `tinyint(1)` | YES |  | `0` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |
| `classroom_location` | `varchar(512)` | YES |  | `NULL` |
| `attendance_required` | `tinyint(1)` | YES |  | `0` |
| `attendance_directions` | `text` | YES |  | `NULL` |
| `arrival_checkin_procedures` | `text` | YES |  | `NULL` |
| `student_pickup_procedures` | `text` | YES |  | `NULL` |
| `dismissal_procedures` | `text` | YES |  | `NULL` |
| `emergency_procedures` | `text` | YES |  | `NULL` |
| `egghead_tips` | `text` | YES |  | `NULL` |

**Foreign Keys:**

- `city_id` → `city.id` *(location_city)*
- `class_pricing_type_id` → `class_pricing_type.id` *(location_class_pricing_type)*
- `contractor_id` → `contractor.id` *(location_contractor)*
- `demo_type_id` → `demo_type.id` *(location_demo_type)*
- `geographic_area_id_online` → `geographic_area.id` *(location_geographic_area)*
- `location_type_id` → `location_type.id` *(location_location_type)*
- `parking_difficulty_id` → `parking_difficulty.id` *(location_parking_difficulty)*
- `poc_title_id` → `poc_title.id` *(location_poc_title)*

## location_cut_type

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `location_id` | `int` | NO | MUL | `NULL` |
| `cut_type_id` | `int` | NO | MUL | `NULL` |
| `amount` | `decimal(11,3)` | YES |  | `NULL` |
| `description` | `char(255)` | YES |  | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

**Foreign Keys:**

- `cut_type_id` → `cut_type.id` *(location_cut_type_cut_type)*
- `location_id` → `location.id` *(location_cut_type_location)*

## location_type

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `location_type_name` | `char(64)` | NO | UNI | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## parking_difficulty

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `parking_difficulty_name` | `char(64)` | NO | UNI | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## region

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `region_name` | `char(64)` | NO | UNI | `NULL` |
| `sort_order` | `int` | YES |  | `0` |
| `active` | `tinyint(1)` | NO |  | `1` |

## state

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `state_name` | `char(64)` | NO | UNI | `NULL` |
| `state_code` | `char(2)` | NO | UNI | `NULL` |

# Classes & Lessons

## class

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `class_name` | `char(64)` | NO | UNI | `NULL` |
| `class_code` | `char(32)` | NO | UNI | `NULL` |
| `formal_class_name` | `char(128)` | NO | UNI | `NULL` |
| `description` | `text` | YES |  | `NULL` |
| `keywords` | `text` | YES |  | `NULL` |
| `standards` | `text` | YES |  | `NULL` |
| `trainual_link` | `varchar(512)` | YES |  | `NULL` |
| `parent_portal_link` | `varchar(512)` | YES |  | `NULL` |
| `parent_portal_qr_path` | `varchar(512)` | YES |  | `NULL` |
| `long_blurb` | `varchar(2048)` | YES |  | `NULL` |
| `short_blurb` | `varchar(1024)` | YES |  | `NULL` |
| `program_type_id` | `int` | NO | MUL | `NULL` |
| `class_type_id` | `int` | NO | MUL | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |
| `has_id_card` | `tinyint(1)` | NO |  | `0` |

**Foreign Keys:**

- `class_type_id` → `class_type.id` *(class_class_type)*
- `program_type_id` → `program_type.id` *(class_program_type)*

## class_pricing_type

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `class_pricing_type_name` | `char(64)` | NO | UNI | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## class_status

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `class_status_name` | `char(64)` | NO | UNI | `NULL` |
| `cancelled` | `tinyint(1)` | NO |  | `NULL` |
| `confirmed` | `tinyint(1)` | NO |  | `NULL` |
| `unconfirmed` | `tinyint(1)` | NO |  | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## class_type

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `class_type_name` | `char(64)` | NO | UNI | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## default_grade

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `default_location_class_type_id` | `int` | NO | MUL | `NULL` |
| `grade_id` | `int` | NO | MUL | `NULL` |
| `age_min` | `decimal(3,1)` | YES |  | `NULL` |
| `age_max` | `decimal(3,1)` | YES |  | `NULL` |

**Foreign Keys:**

- `default_location_class_type_id` → `default_location_class_type.id` *(default_grade_default_location_class_type)*
- `grade_id` → `grade.id` *(default_grade_grade)*

## default_location_class_type

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `location_id` | `int` | NO | MUL | `NULL` |
| `class_type_id` | `int` | NO | MUL | `NULL` |
| `monday` | `tinyint(1)` | NO |  | `NULL` |
| `tuesday` | `tinyint(1)` | NO |  | `NULL` |
| `wednesday` | `tinyint(1)` | NO |  | `NULL` |
| `thursday` | `tinyint(1)` | NO |  | `NULL` |
| `friday` | `tinyint(1)` | NO |  | `NULL` |
| `saturday` | `tinyint(1)` | NO |  | `NULL` |
| `sunday` | `tinyint(1)` | NO |  | `NULL` |
| `start_time` | `time` | YES |  | `NULL` |
| `length_minutes` | `int` | YES |  | `NULL` |
| `cost` | `decimal(10,2)` | YES |  | `NULL` |
| `cost_notes` | `char(255)` | YES |  | `NULL` |
| `lab_fee_type_id` | `int` | YES | MUL | `NULL` |
| `lab_fee_amount` | `decimal(10,2)` | YES |  | `NULL` |
| `minimum_students` | `int` | YES |  | `NULL` |
| `maximum_students` | `int` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |

**Foreign Keys:**

- `class_type_id` → `class_type.id` *(default_location_class_class_type)*
- `location_id` → `location.id` *(default_location_class_location)*
- `lab_fee_type_id` → `lab_fee_type.id` *(default_location_class_type_lab_fee_type)*

## lab_fee_type

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `lab_fee_type_name` | `char(64)` | NO | UNI | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## lesson

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `lesson_name` | `char(64)` | NO | MUL | `NULL` |
| `trainual_link` | `varchar(512)` | YES |  | `NULL` |
| `description` | `text` | YES |  | `NULL` |
| `keywords` | `text` | YES |  | `NULL` |
| `parent_portal_link` | `varchar(512)` | YES |  | `NULL` |
| `parent_portal_qr_path` | `varchar(512)` | YES |  | `NULL` |
| `lesson_type` | `enum('science','engineering','robotics','financial_literacy')` | YES |  | `NULL` |
| `class_id` | `int` | YES | MUL | `NULL` |
| `status_one_sheet` | `enum('up_to_date','update_needed')` | YES |  | `NULL` |
| `status_materials` | `enum('up_to_date','update_needed')` | YES |  | `NULL` |
| `status_video` | `enum('up_to_date','update_needed')` | YES |  | `NULL` |
| `status_trainual` | `enum('up_to_date','update_needed')` | YES |  | `NULL` |
| `status_standards` | `enum('up_to_date','update_needed')` | YES |  | `NULL` |
| `status_science_accuracy` | `enum('up_to_date','update_needed')` | YES |  | `NULL` |
| `last_reviewed` | `date` | YES |  | `NULL` |
| `next_update_required` | `date` | YES |  | `NULL` |
| `review_status` | `enum('okay','review','overdue')` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |
| `sku` | `varchar(100)` | YES |  | `NULL` |
| `sku_for_20` | `varchar(100)` | YES |  | `NULL` |
| `sort_order` | `int` | YES |  | `0` |

**Foreign Keys:**

- `class_id` → `class.id` *(lesson_class)*

## lesson_class

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `lesson_id` | `int` | NO | MUL | `NULL` |
| `class_id` | `int` | NO |  | `NULL` |
| `camp_type` | `enum('full_day','half_day')` | YES |  | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | YES |  | `CURRENT_TIMESTAMP` |
| `sort_order` | `int` | NO |  | `0` |

# Professors & Staff

## availability

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `weekday_id` | `int` | NO | MUL | `NULL` |
| `time_from` | `time` | YES |  | `NULL` |
| `time_to` | `time` | YES |  | `NULL` |
| `notes` | `varchar(1024)` | NO |  | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

**Foreign Keys:**

- `professor_id` → `professor.id` *(availability_professor)*
- `weekday_id` → `weekday.id` *(availability_weekday)*

## contractor

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `contractor_name` | `char(64)` | NO | UNI | `NULL` |
| `salesperson_user_id` | `int` | YES |  | `NULL` |
| `client_since` | `varchar(128)` | YES |  | `NULL` |
| `relationship_strength` | `varchar(64)` | YES |  | `NULL` |
| `rebooking_notes` | `text` | YES |  | `NULL` |
| `minimum_to_run` | `text` | YES |  | `NULL` |
| `last_price_raise` | `text` | YES |  | `NULL` |
| `key_contact_name` | `varchar(128)` | YES |  | `NULL` |
| `key_contact_email` | `varchar(256)` | YES |  | `NULL` |
| `key_contact_phone` | `varchar(64)` | YES |  | `NULL` |
| `day_of_notifications` | `text` | YES |  | `NULL` |
| `client_vibe` | `text` | YES |  | `NULL` |
| `livescan_multiple` | `tinyint(1)` | NO |  | `NULL` |
| `livescan_required` | `tinyint(1)` | YES |  | `0` |
| `tb_required` | `tinyint(1)` | YES |  | `0` |
| `professor_misc_notes` | `text` | YES |  | `NULL` |
| `behavioral_guidelines` | `text` | YES |  | `NULL` |
| `area_demographic` | `text` | YES |  | `NULL` |
| `flexibility_notes` | `text` | YES |  | `NULL` |
| `invoice_notes` | `text` | YES |  | `NULL` |
| `invoice_type` | `enum('Monthly','2nd Week','After Last Class')` | YES |  | `NULL` |
| `invoice_per_location` | `tinyint(1)` | NO |  | `0` |
| `invoice_contact_name` | `varchar(128)` | YES |  | `NULL` |
| `invoice_contact_email` | `varchar(256)` | YES |  | `NULL` |
| `invoice_contact_phone` | `varchar(64)` | YES |  | `NULL` |
| `last_updated` | `date` | YES |  | `NULL` |
| `general_notes` | `text` | YES |  | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## evaluation_schedule

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `tier_name` | `varchar(50)` | NO |  | `NULL` |
| `min_days_on_staff` | `int` | NO |  | `NULL` |
| `max_days_on_staff` | `int` | YES |  | `NULL` |
| `frequency_days` | `int` | NO |  | `NULL` |
| `sort_order` | `int` | YES |  | `0` |
| `active` | `tinyint(1)` | YES |  | `1` |

## livescan

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `location_id` | `int` | YES | MUL | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `livescan_date` | `date` | YES |  | `NULL` |
| `livescan_link` | `varchar(1024)` | YES |  | `NULL` |
| `notes` | `varchar(1024)` | YES |  | `NULL` |
| `pass` | `tinyint(1)` | NO |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |
| `contractor_id` | `int` | YES | MUL | `NULL` |

**Foreign Keys:**

- `contractor_id` → `contractor.id` *(fk_livescan_contractor)*
- `location_id` → `location.id` *(livescan_location)*
- `professor_id` → `professor.id` *(livescan_professor)*

## observation_delete_reason

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `reason_name` | `varchar(100)` | NO |  | `NULL` |
| `sort_order` | `int` | YES |  | `0` |
| `active` | `tinyint(1)` | YES |  | `1` |

## poc_title

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `poc_title_name` | `char(128)` | NO | UNI | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## professor

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `professor_nickname` | `char(255)` | NO | UNI | `NULL` |
| `professor_status_id` | `int` | NO | MUL | `NULL` |
| `first_name` | `char(64)` | NO |  | `NULL` |
| `last_name` | `char(64)` | NO |  | `NULL` |
| `email` | `char(128)` | YES |  | `NULL` |
| `phone_number` | `char(128)` | YES |  | `NULL` |
| `address` | `char(255)` | YES |  | `NULL` |
| `city_id` | `int` | YES | MUL | `NULL` |
| `general_notes` | `varchar(1024)` | YES |  | `NULL` |
| `availability_notes` | `varchar(1024)` | YES |  | `NULL` |
| `emergency_contact` | `char(128)` | YES |  | `NULL` |
| `emergency_contact_number` | `char(128)` | YES |  | `NULL` |
| `birthday` | `date` | YES |  | `NULL` |
| `hire_date` | `date` | YES |  | `NULL` |
| `termination_date` | `date` | YES |  | `NULL` |
| `termination_rason` | `char(255)` | YES |  | `NULL` |
| `schedule_link` | `char(64)` | YES |  | `NULL` |
| `base_pay` | `decimal(10,2)` | YES |  | `NULL` |
| `assist_pay` | `decimal(10,2)` | YES |  | `NULL` |
| `pickup_pay` | `decimal(10,2)` | YES |  | `NULL` |
| `party_pay` | `decimal(10,2)` | YES |  | `NULL` |
| `camp_pay` | `decimal(10,2)` | YES |  | `NULL` |
| `science_trained_id` | `tinyint(1)` | YES | MUL | `NULL` |
| `engineering_trained_id` | `tinyint(1)` | YES | MUL | `NULL` |
| `show_party_trained_id` | `tinyint(1)` | YES | MUL | `NULL` |
| `scheduling_coordinator_owner_id` | `int` | YES | MUL | `NULL` |
| `studysmart_trained_id` | `tinyint(1)` | YES | MUL | `NULL` |
| `camp_trained_id` | `tinyint(1)` | YES | MUL | `NULL` |
| `virtus` | `tinyint(1)` | NO |  | `0` |
| `virtus_date` | `date` | YES |  | `NULL` |
| `tb_test` | `tinyint(1)` | NO |  | `0` |
| `tb_date` | `date` | YES |  | `NULL` |
| `rating` | `decimal(5,2)` | YES |  | `NULL` |
| `onboard_status_id` | `int` | YES | MUL | `NULL` |
| `number_of_subs_claimed` | `int` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |
| `geographic_area` | `varchar(128)` | YES |  | `NULL` |
| `robotics_trained_id` | `tinyint` | YES |  | `NULL` |
| `geographic_area_id` | `int` | YES |  | `NULL` |
| `user_id` | `int` | YES |  | `NULL` |
| `last_evaluation_date` | `date` | YES |  | `NULL` |
| `last_evaluation_result` | `varchar(20)` | YES |  | `NULL` |
| `requires_observations` | `tinyint(1)` | NO |  | `0` |
| `observations_cleared` | `tinyint(1)` | NO |  | `0` |
| `observations_cleared_by` | `int` | YES |  | `NULL` |
| `observations_cleared_at` | `datetime` | YES |  | `NULL` |

**Foreign Keys:**

- `city_id` → `city.id` *(professor_city)*
- `onboard_status_id` → `onboard_status.id` *(professor_onboard_status)*
- `professor_status_id` → `professor_status.id` *(professor_professor_status)*
- `scheduling_coordinator_owner_id` → `user.id` *(professor_scheduling_coordinator_owner)*

## professor_evaluation

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `evaluation_date` | `date` | NO | MUL | `NULL` |
| `evaluator_professor_id` | `int` | YES |  | `NULL` |
| `evaluator_user_id` | `int` | YES |  | `NULL` |
| `evaluation_type` | `enum('initial','routine','follow_up','formal','peer_to_peer','support_session')` | YES |  | `formal` |
| `result` | `enum('pass','needs_improvement','fail')` | YES |  | `NULL` |
| `form_link` | `varchar(1024)` | YES |  | `NULL` |
| `notes` | `varchar(1024)` | YES |  | `NULL` |
| `active` | `tinyint(1)` | YES |  | `1` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | YES |  | `CURRENT_TIMESTAMP` |
| `form_status` | `enum('pending','completed','deleted')` | YES |  | `pending` |
| `form_data` | `json` | YES |  | `NULL` |
| `delete_reason_id` | `int` | YES |  | `NULL` |
| `delete_notes` | `varchar(512)` | YES |  | `NULL` |
| `remediation_followup` | `varchar(30)` | YES |  | `NULL` |
| `remediation_due_date` | `date` | YES |  | `NULL` |

## professor_incident

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `incident_date` | `date` | YES |  | `NULL` |
| `description` | `text` | NO |  | `NULL` |
| `reported_by_user_id` | `int` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |

## professor_observation

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `program_id` | `int` | NO | MUL | `NULL` |
| `observation_date` | `date` | NO | MUL | `NULL` |
| `observation_type` | `enum('observation','evaluation')` | YES |  | `observation` |
| `pay_amount` | `decimal(10,2)` | YES |  | `NULL` |
| `is_paid` | `tinyint(1)` | YES |  | `1` |
| `status` | `enum('scheduled','completed','cancelled')` | YES |  | `scheduled` |
| `notes` | `varchar(512)` | YES |  | `NULL` |
| `assigned_by_user_id` | `int` | YES |  | `NULL` |
| `completed_at` | `datetime` | YES |  | `NULL` |
| `active` | `tinyint(1)` | YES |  | `1` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | YES |  | `CURRENT_TIMESTAMP` |
| `form_status` | `enum('pending','completed','deleted')` | YES |  | `pending` |
| `form_data` | `json` | YES |  | `NULL` |
| `delete_reason_id` | `int` | YES |  | `NULL` |
| `delete_notes` | `varchar(512)` | YES |  | `NULL` |
| `remediation_followup` | `varchar(30)` | YES |  | `NULL` |
| `remediation_due_date` | `date` | YES |  | `NULL` |
| `evaluator_professor_id` | `int` | YES |  | `NULL` |

## professor_status

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `professor_status_name` | `char(64)` | NO | UNI | `NULL` |
| `professor_active` | `tinyint(1)` | NO |  | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

# Hiring & Onboarding

## candidate

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `full_name` | `varchar(128)` | NO |  | `NULL` |
| `email` | `varchar(128)` | NO | UNI | `NULL` |
| `phone` | `varchar(64)` | YES |  | `NULL` |
| `status` | `enum('pending','in_progress','complete','rejected','hired')` | NO |  | `pending` |
| `geographic_area_id` | `int` | YES |  | `NULL` |
| `onboarder_user_id` | `int` | YES |  | `NULL` |
| `trainer_user_id` | `int` | YES |  | `NULL` |
| `recruiter_user_id` | `int` | YES |  | `NULL` |
| `first_class_date` | `date` | YES |  | `NULL` |
| `accepted_at` | `datetime` | YES |  | `NULL` |
| `professor_id` | `int` | YES |  | `NULL` |
| `user_id` | `int` | YES |  | `NULL` |
| `notes` | `text` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |
| `address` | `varchar(256)` | YES |  | `NULL` |
| `city` | `varchar(64)` | YES |  | `NULL` |
| `state` | `varchar(2)` | YES |  | `NULL` |
| `zip` | `varchar(16)` | YES |  | `NULL` |
| `shirt_size` | `varchar(16)` | YES |  | `NULL` |
| `availability_notes` | `text` | YES |  | `NULL` |
| `how_heard` | `varchar(128)` | YES |  | `NULL` |
| `resume_link` | `varchar(512)` | YES |  | `NULL` |
| `scheduling_coordinator_user_id` | `int` | YES |  | `NULL` |
| `field_manager_user_id` | `int` | YES |  | `NULL` |
| `schedule_ready` | `tinyint(1)` | YES |  | `0` |
| `schedule_confirmed_at` | `datetime` | YES |  | `NULL` |
| `schedule_changed_since_confirm` | `tinyint(1)` | YES |  | `0` |
| `lead_pay` | `decimal(10,2)` | YES |  | `NULL` |
| `assist_pay` | `decimal(10,2)` | YES |  | `NULL` |
| `phase` | `enum('onboarding','training')` | YES |  | `onboarding` |
| `onboarding_pay_submitted` | `tinyint(1)` | YES |  | `0` |
| `requires_observations` | `tinyint(1)` | NO |  | `0` |

## candidate_applied_template

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `candidate_id` | `int` | NO | MUL | `NULL` |
| `template_id` | `int` | NO | MUL | `NULL` |
| `applied_at` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `applied_by_user_id` | `int` | YES |  | `NULL` |

**Foreign Keys:**

- `candidate_id` → `candidate.id` *(candidate_applied_template_ibfk_1)*
- `template_id` → `onboarding_template.id` *(candidate_applied_template_ibfk_2)*

## candidate_availability

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `candidate_id` | `int` | NO | UNI | `NULL` |
| `monday` | `tinyint(1)` | NO |  | `0` |
| `monday_notes` | `varchar(128)` | YES |  | `NULL` |
| `tuesday` | `tinyint(1)` | NO |  | `0` |
| `tuesday_notes` | `varchar(128)` | YES |  | `NULL` |
| `wednesday` | `tinyint(1)` | NO |  | `0` |
| `wednesday_notes` | `varchar(128)` | YES |  | `NULL` |
| `thursday` | `tinyint(1)` | NO |  | `0` |
| `thursday_notes` | `varchar(128)` | YES |  | `NULL` |
| `friday` | `tinyint(1)` | NO |  | `0` |
| `friday_notes` | `varchar(128)` | YES |  | `NULL` |
| `saturday` | `tinyint(1)` | NO |  | `0` |
| `saturday_notes` | `varchar(128)` | YES |  | `NULL` |
| `sunday` | `tinyint(1)` | NO |  | `0` |
| `sunday_notes` | `varchar(128)` | YES |  | `NULL` |
| `additional_notes` | `text` | YES |  | `NULL` |
| `personal_info_completed` | `tinyint(1)` | NO |  | `0` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `candidate_id` → `candidate.id` *(candidate_availability_ibfk_1)*

## candidate_document

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `candidate_id` | `int` | NO | MUL | `NULL` |
| `candidate_requirement_id` | `int` | YES |  | `NULL` |
| `file_name` | `varchar(255)` | NO |  | `NULL` |
| `file_size` | `int` | YES |  | `NULL` |
| `mime_type` | `varchar(128)` | YES |  | `NULL` |
| `storage_path` | `varchar(512)` | NO |  | `NULL` |
| `uploaded_by_user_id` | `int` | YES |  | `NULL` |
| `uploaded_by_candidate` | `tinyint(1)` | NO |  | `0` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `candidate_id` → `candidate.id` *(candidate_document_ibfk_1)*

## candidate_email

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `candidate_id` | `int` | NO | MUL | `NULL` |
| `gmail_thread_id` | `varchar(128)` | YES |  | `NULL` |
| `gmail_message_id` | `varchar(128)` | YES |  | `NULL` |
| `subject` | `varchar(512)` | YES |  | `NULL` |
| `from_email` | `varchar(256)` | YES |  | `NULL` |
| `to_email` | `varchar(256)` | YES |  | `NULL` |
| `body_html` | `text` | YES |  | `NULL` |
| `body_text` | `text` | YES |  | `NULL` |
| `direction` | `enum('sent','received')` | NO |  | `sent` |
| `sent_by_user_id` | `int` | YES |  | `NULL` |
| `sent_at` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `candidate_id` → `candidate.id` *(candidate_email_ibfk_1)*

## candidate_message

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `candidate_id` | `int` | NO | MUL | `NULL` |
| `sent_by_user_id` | `int` | YES | MUL | `NULL` |
| `body` | `text` | NO |  | `NULL` |
| `is_from_candidate` | `tinyint(1)` | YES |  | `0` |
| `active` | `tinyint(1)` | YES |  | `1` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |

## candidate_note

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `candidate_id` | `int` | NO | MUL | `NULL` |
| `user_id` | `int` | NO |  | `NULL` |
| `body` | `text` | NO |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `candidate_id` → `candidate.id` *(candidate_note_ibfk_1)*

## candidate_requirement

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `candidate_id` | `int` | NO | MUL | `NULL` |
| `requirement_id` | `int` | NO | MUL | `NULL` |
| `completed` | `tinyint(1)` | NO |  | `0` |
| `completed_at` | `datetime` | YES |  | `NULL` |
| `completed_by_user_id` | `int` | YES |  | `NULL` |
| `assigned_to_user_id` | `int` | YES |  | `NULL` |
| `due_date` | `date` | YES |  | `NULL` |
| `status` | `enum('not_started','in_progress','complete','overdue','waived')` | NO |  | `not_started` |
| `notes` | `text` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `assigned_role` | `enum('scheduler','field_manager','recruiter','onboarder','trainer')` | YES |  | `NULL` |
| `needs_approval` | `tinyint(1)` | NO |  | `0` |
| `approval_status` | `enum('not_needed','pending_approval','approved','rejected')` | NO |  | `not_needed` |
| `approved_by_user_id` | `int` | YES |  | `NULL` |
| `approved_at` | `datetime` | YES |  | `NULL` |
| `waived` | `tinyint(1)` | YES |  | `0` |
| `waived_reason` | `varchar(255)` | YES |  | `NULL` |

**Foreign Keys:**

- `candidate_id` → `candidate.id` *(candidate_requirement_ibfk_1)*
- `requirement_id` → `onboarding_requirement.id` *(candidate_requirement_ibfk_2)*

## candidate_schedule

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `candidate_id` | `int` | NO | MUL | `NULL` |
| `program_id` | `int` | NO | MUL | `NULL` |
| `role` | `enum('Lead','Assistant')` | YES |  | `Lead` |
| `assigned_by_user_id` | `int` | YES |  | `NULL` |
| `status` | `enum('pending','ready','confirmed','changed')` | YES |  | `pending` |
| `confirmed_at` | `datetime` | YES |  | `NULL` |
| `notes` | `varchar(512)` | YES |  | `NULL` |
| `active` | `tinyint(1)` | YES |  | `1` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | YES |  | `CURRENT_TIMESTAMP` |

## candidate_task

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `candidate_id` | `int` | NO | MUL | `NULL` |
| `assigned_to_user_id` | `int` | YES |  | `NULL` |
| `created_by_user_id` | `int` | YES |  | `NULL` |
| `title` | `varchar(255)` | NO |  | `NULL` |
| `description` | `text` | YES |  | `NULL` |
| `due_date` | `date` | YES |  | `NULL` |
| `completed` | `tinyint(1)` | NO |  | `0` |
| `completed_at` | `datetime` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `candidate_id` → `candidate.id` *(candidate_task_ibfk_1)*

## hiring_request

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `submitted_by_user_id` | `int` | NO |  | `NULL` |
| `geographic_area_id` | `int` | NO | MUL | `NULL` |
| `city_detail` | `varchar(255)` | YES |  | `NULL` |
| `avail_mon_am` | `tinyint(1)` | YES |  | `0` |
| `avail_mon_pm` | `tinyint(1)` | YES |  | `0` |
| `avail_tue_am` | `tinyint(1)` | YES |  | `0` |
| `avail_tue_pm` | `tinyint(1)` | YES |  | `0` |
| `avail_wed_am` | `tinyint(1)` | YES |  | `0` |
| `avail_wed_pm` | `tinyint(1)` | YES |  | `0` |
| `avail_thu_am` | `tinyint(1)` | YES |  | `0` |
| `avail_thu_pm` | `tinyint(1)` | YES |  | `0` |
| `avail_fri_am` | `tinyint(1)` | YES |  | `0` |
| `avail_fri_pm` | `tinyint(1)` | YES |  | `0` |
| `fulfillment_date` | `date` | YES |  | `NULL` |
| `earliest_start_date` | `date` | YES |  | `NULL` |
| `fulfillment_notes` | `text` | YES |  | `NULL` |
| `requires_livescan` | `tinyint(1)` | YES |  | `0` |
| `requires_virtus` | `tinyint(1)` | YES |  | `0` |
| `requires_tb` | `tinyint(1)` | YES |  | `0` |
| `experience_level` | `enum('15_students','20_students')` | YES |  | `NULL` |
| `training_type` | `enum('in_person','virtual')` | YES |  | `in_person` |
| `class_types` | `json` | YES |  | `NULL` |
| `program_types` | `json` | YES |  | `NULL` |
| `base_pay` | `decimal(8,2)` | YES |  | `NULL` |
| `special_notes` | `text` | YES |  | `NULL` |
| `status` | `enum('open','in_progress','filled','cancelled')` | YES | MUL | `open` |
| `candidate_id` | `int` | YES | MUL | `NULL` |
| `filled_at` | `datetime` | YES |  | `NULL` |
| `active` | `tinyint(1)` | YES |  | `1` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | YES |  | `CURRENT_TIMESTAMP` |
| `requires_observations` | `tinyint(1)` | NO |  | `0` |

## hiring_request_program

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `hiring_request_id` | `int` | NO | MUL | `NULL` |
| `program_id` | `int` | NO | MUL | `NULL` |

## onboard_status

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `onboard_status_name` | `char(64)` | NO | UNI | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## onboarding_pay_entries

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `professor_id` | `int` | YES | MUL | `NULL` |
| `professor_name_raw` | `varchar(200)` | YES |  | `NULL` |
| `training_date` | `date` | NO | MUL | `NULL` |
| `trainer` | `varchar(100)` | YES |  | `NULL` |
| `submitted_by` | `varchar(100)` | NO |  | `NULL` |
| `submitted_at` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `trainual_completed` | `tinyint(1)` | NO |  | `0` |
| `modules_completed` | `int` | YES |  | `NULL` |
| `trainual_pay` | `decimal(8,2)` | NO |  | `35.00` |
| `virtual_training_completed` | `tinyint(1)` | NO |  | `0` |
| `virtual_training_pay` | `decimal(8,2)` | NO |  | `40.00` |
| `total_training_pay` | `decimal(8,2)` *(STORED GENERATED)* | YES |  | `NULL` |
| `bg_check_completed` | `tinyint(1)` | NO |  | `0` |
| `bg_check_cost` | `decimal(8,2)` | NO |  | `55.00` |
| `training_outcome` | `enum('Passed to Scheduling','Will Not Complete Training','Lost Candidate')` | NO |  | `NULL` |
| `terminate_upon_payment` | `tinyint(1)` | NO |  | `0` |
| `is_rehire` | `tinyint(1)` | NO |  | `0` |
| `is_reviewed` | `tinyint(1)` | NO | MUL | `0` |
| `reviewed_by` | `varchar(100)` | YES |  | `NULL` |
| `reviewed_at` | `datetime` | YES |  | `NULL` |
| `candidate_id` | `int` | YES |  | `NULL` |

**Foreign Keys:**

- `professor_id` → `professor.id` *(onboarding_pay_entries_ibfk_1)*

## onboarding_requirement

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `title` | `varchar(255)` | NO |  | `NULL` |
| `description` | `text` | YES |  | `NULL` |
| `category` | `varchar(64)` | YES |  | `NULL` |
| `type` | `enum('task','document','training','compliance')` | NO |  | `task` |
| `requires_document` | `tinyint(1)` | NO |  | `0` |
| `sort_order` | `int` | NO |  | `0` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |
| `assigned_role` | `enum('scheduler','field_manager','recruiter','onboarder','trainer')` | YES |  | `NULL` |
| `email_template_id` | `int` | YES |  | `NULL` |
| `needs_approval` | `tinyint(1)` | NO |  | `0` |
| `due_basis` | `enum('days_after_hire','days_before_hire','days_after_start','days_before_start')` | YES |  | `NULL` |
| `due_days` | `int` | YES |  | `NULL` |

## onboarding_template

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `name` | `varchar(128)` | NO |  | `NULL` |
| `description` | `text` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |

## onboarding_template_item

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `template_id` | `int` | NO | MUL | `NULL` |
| `requirement_id` | `int` | NO | MUL | `NULL` |
| `due_offset_days` | `int` | YES |  | `NULL` |
| `sort_order` | `int` | NO |  | `0` |

**Foreign Keys:**

- `template_id` → `onboarding_template.id` *(onboarding_template_item_ibfk_1)*
- `requirement_id` → `onboarding_requirement.id` *(onboarding_template_item_ibfk_2)*

# Parties & Events

## camp_coordinator_kit

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `item_name` | `varchar(200)` | NO |  | `NULL` |
| `sku` | `varchar(100)` | YES |  | `NULL` |
| `qty_per_kit` | `int` | NO |  | `1` |
| `kit_type` | `enum('full_day','half_day','both')` | NO |  | `both` |
| `notes` | `text` | YES |  | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## camp_curriculum

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `camp_day_name` | `varchar(200)` | NO | UNI | `NULL` |
| `camp_type_name` | `varchar(128)` | NO |  | `NULL` |
| `day_format` | `enum('full_day','half_day')` | NO |  | `NULL` |
| `lesson_1` | `varchar(200)` | YES |  | `NULL` |
| `lesson_2` | `varchar(200)` | YES |  | `NULL` |
| `lesson_3` | `varchar(200)` | YES |  | `NULL` |
| `lesson_4` | `varchar(200)` | YES |  | `NULL` |
| `lesson_5` | `varchar(200)` | YES |  | `NULL` |
| `sku_standard` | `varchar(100)` | YES |  | `NULL` |
| `sku_full` | `varchar(100)` | YES |  | `NULL` |
| `sku_half` | `varchar(100)` | YES |  | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## demo_type

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `demo_type_name` | `char(64)` | NO | UNI | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## party_assignment_ask

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `program_id` | `int` | NO | MUL | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `ask_type` | `enum('ask','assign')` | NO |  | `ask` |
| `asked_by_user_id` | `int` | YES | MUL | `NULL` |
| `asked_at` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |
| `response` | `enum('pending','accepted','declined')` | YES | MUL | `pending` |
| `response_at` | `datetime` | YES |  | `NULL` |
| `decline_reason` | `varchar(500)` | YES |  | `NULL` |
| `notes` | `text` | YES |  | `NULL` |
| `email_sent` | `tinyint(1)` | YES |  | `0` |
| `active` | `tinyint(1)` | YES |  | `1` |
| `ts_inserted` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `program_id` → `program.id` *(party_assignment_ask_ibfk_1)*
- `professor_id` → `professor.id` *(party_assignment_ask_ibfk_2)*
- `asked_by_user_id` → `user.id` *(party_assignment_ask_ibfk_3)*

## party_email_log

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `program_id` | `int` | NO | MUL | `NULL` |
| `template_id` | `int` | YES |  | `NULL` |
| `recipient_email` | `varchar(255)` | YES |  | `NULL` |
| `subject` | `varchar(255)` | YES |  | `NULL` |
| `sent_by_user_id` | `int` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |

## party_email_template

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `name` | `varchar(100)` | NO |  | `NULL` |
| `subject` | `varchar(255)` | NO |  | `NULL` |
| `body` | `text` | NO |  | `NULL` |
| `is_default` | `tinyint(1)` | YES |  | `0` |
| `active` | `tinyint(1)` | YES |  | `1` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | YES |  | `CURRENT_TIMESTAMP` |

## party_format

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `party_format_name` | `varchar(100)` | NO |  | `NULL` |
| `active` | `tinyint` | NO |  | `1` |
| `ts_inserted` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `datetime` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |

## party_kit_type

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `kit_name` | `varchar(128)` | NO |  | `NULL` |
| `event_type` | `enum('party','booth','workshop')` | NO |  | `NULL` |
| `sku` | `varchar(100)` | YES |  | `NULL` |
| `description` | `text` | YES |  | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## party_session_pay

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `party_id` | `int` | NO | MUL | `NULL` |
| `role` | `enum('Lead','Assistant')` | NO |  | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `pay_amount` | `decimal(8,2)` | NO |  | `0.00` |
| `drive_fee` | `decimal(8,2)` | NO |  | `0.00` |
| `tip_amount` | `decimal(8,2)` | NO |  | `0.00` |
| `dry_ice_reimbursement` | `decimal(8,2)` | NO |  | `0.00` |
| `total_reimbursement` | `decimal(8,2)` *(STORED GENERATED)* | YES |  | `NULL` |
| `reimbursements_paid` | `tinyint(1)` | NO | MUL | `0` |
| `is_late_reimbursement` | `tinyint(1)` | NO |  | `0` |
| `late_reimbursement_notes` | `text` | YES |  | `NULL` |
| `created_at` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `updated_at` | `datetime` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `party_id` → `program.id` *(party_session_pay_ibfk_1)*
- `professor_id` → `professor.id` *(party_session_pay_ibfk_2)*

## party_shipment

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `program_id` | `int` | NO |  | `NULL` |
| `order_id` | `int` | YES | MUL | `NULL` |
| `merged_with_professor_order` | `tinyint(1)` | NO |  | `0` |
| `ship_by_date` | `date` | NO |  | `NULL` |
| `shipped_at` | `datetime` | YES |  | `NULL` |
| `notes` | `text` | YES |  | `NULL` |
| `created_at` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `order_id` → `shipment_order.id` *(party_shipment_ibfk_1)*

# Students & Parents

## grade

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `grade_name` | `char(64)` | NO | UNI | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## parent

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `first_name` | `char(64)` | YES |  | `NULL` |
| `last_name` | `char(64)` | YES |  | `NULL` |
| `city_id` | `int` | YES | MUL | `NULL` |
| `address` | `char(128)` | YES |  | `NULL` |
| `email` | `char(128)` | YES | UNI | `NULL` |
| `phone` | `char(128)` | YES |  | `NULL` |
| `user_name` | `char(64)` | YES | UNI | `NULL` |
| `password` | `char(64)` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |

**Foreign Keys:**

- `city_id` → `city.id` *(parent_city)*

## parent_role

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `parent_role_name` | `char(64)` | NO | UNI | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## student

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `first_name` | `char(64)` | YES |  | `NULL` |
| `last_name` | `char(64)` | YES |  | `NULL` |
| `birthday` | `date` | YES |  | `NULL` |
| `current_grade_id` | `int` | YES |  | `NULL` |
| `city_id` | `int` | YES | MUL | `NULL` |
| `location_id` | `int` | YES |  | `NULL` |
| `address` | `char(128)` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |

**Foreign Keys:**

- `city_id` → `city.id` *(student_city)*

## student_parent

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `student_id` | `int` | NO | MUL | `NULL` |
| `parent_id` | `int` | NO | MUL | `NULL` |
| `parent_role_id` | `int` | NO | MUL | `NULL` |
| `notes` | `char(255)` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |

**Foreign Keys:**

- `parent_id` → `parent.id` *(student_parent_parent)*
- `parent_role_id` → `parent_role.id` *(student_parent_parent_role)*
- `student_id` → `student.id` *(student_parent_student)*

# Payroll & Pay

## field_manager_payroll_rocketology

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `payroll_run_id` | `int` | NO | MUL | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `gusto_employee_id` | `varchar(10)` | NO |  | `NULL` |
| `last_name` | `varchar(100)` | NO |  | `NULL` |
| `first_name` | `varchar(100)` | NO |  | `NULL` |
| `employment_title` | `varchar(100)` | NO |  | `Field Manager (Primary)` |
| `regular_hours` | `decimal(8,2)` | NO |  | `0.00` |
| `bonus` | `decimal(10,2)` | NO |  | `0.00` |
| `reimbursement` | `decimal(10,2)` | NO |  | `0.00` |
| `pto_hours` | `decimal(6,2)` | NO |  | `0.00` |
| `sick_hours` | `decimal(6,2)` | NO |  | `0.00` |
| `calculated_at` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `payroll_run_id` → `payroll_runs_rocketology.id` *(field_manager_payroll_rocketology_ibfk_1)*
- `professor_id` → `professor.id` *(field_manager_payroll_rocketology_ibfk_2)*

## field_manager_time_entries

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `user_id` | `int` | YES | MUL | `NULL` |
| `work_date` | `date` | NO | MUL | `NULL` |
| `time_in` | `time` | NO |  | `NULL` |
| `time_out` | `time` | NO |  | `NULL` |
| `break_minutes` | `int` | NO |  | `0` |
| `work_location` | `enum('field_majority','field_and_home','home')` | YES |  | `NULL` |
| `field_activities` | `text` | YES |  | `NULL` |
| `wfh_activities` | `text` | YES |  | `NULL` |
| `professors_contacted` | `text` | YES |  | `NULL` |
| `concerns` | `text` | YES |  | `NULL` |
| `total_hours` | `decimal(6,2)` *(STORED GENERATED)* | YES |  | `NULL` |
| `description` | `text` | YES |  | `NULL` |
| `submitted_at` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `is_approved` | `tinyint(1)` | NO |  | `0` |
| `approved_by` | `varchar(100)` | YES |  | `NULL` |
| `approved_at` | `datetime` | YES |  | `NULL` |

**Foreign Keys:**

- `professor_id` → `professor.id` *(field_manager_time_entries_ibfk_1)*

## gusto_employee_codes

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `company` | `enum('Rocketology','PES')` | NO |  | `NULL` |
| `gusto_employee_id` | `varchar(10)` | NO | UNI | `NULL` |
| `gusto_last_name` | `varchar(100)` | NO |  | `NULL` |
| `gusto_first_name` | `varchar(100)` | NO |  | `NULL` |
| `nickname` | `varchar(100)` | YES |  | `NULL` |
| `is_active` | `tinyint(1)` | NO |  | `1` |
| `created_at` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `updated_at` | `datetime` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `professor_id` → `professor.id` *(gusto_employee_codes_ibfk_1)*

## mileage_daily_entries

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `mileage_week_id` | `int` | NO | MUL | `NULL` |
| `entry_date` | `date` | NO |  | `NULL` |
| `odometer_start` | `decimal(10,1)` | NO |  | `NULL` |
| `odometer_end` | `decimal(10,1)` | NO |  | `NULL` |
| `miles` | `decimal(8,1)` *(STORED GENERATED)* | YES |  | `NULL` |
| `description` | `varchar(500)` | NO |  | `NULL` |
| `created_at` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `mileage_week_id` → `mileage_weeks.id` *(mileage_daily_entries_ibfk_1)*

## mileage_submissions

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `user_id` | `int` | YES |  | `NULL` |
| `submission_date` | `date` | NO |  | `NULL` |
| `miles_claimed` | `int` | NO |  | `NULL` |
| `reimbursement_total` | `decimal(8,2)` | NO |  | `NULL` |
| `pdf_link` | `varchar(500)` | YES |  | `NULL` |
| `submitted_by` | `varchar(100)` | YES |  | `NULL` |
| `submitted_at` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `is_processed` | `tinyint(1)` | NO | MUL | `0` |
| `processed_at` | `datetime` | YES |  | `NULL` |

**Foreign Keys:**

- `professor_id` → `professor.id` *(mileage_submissions_ibfk_1)*

## mileage_weeks

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `user_id` | `int` | YES | MUL | `NULL` |
| `week_start` | `date` | NO |  | `NULL` |
| `week_end` | `date` | NO |  | `NULL` |
| `total_miles` | `decimal(8,2)` | YES |  | `0.00` |
| `reimbursement_rate` | `decimal(6,4)` | NO |  | `NULL` |
| `reimbursement_total` | `decimal(8,2)` | YES |  | `0.00` |
| `status` | `enum('draft','submitted','approved','rejected')` | YES |  | `draft` |
| `submitted_at` | `datetime` | YES |  | `NULL` |
| `approved_by` | `varchar(100)` | YES |  | `NULL` |
| `approved_at` | `datetime` | YES |  | `NULL` |
| `rejection_note` | `varchar(500)` | YES |  | `NULL` |
| `created_at` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `professor_id` → `professor.id` *(mileage_weeks_ibfk_1)*

## misc_pay_entries

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `professor_id` | `int` | YES | MUL | `NULL` |
| `professor_name_raw` | `varchar(200)` | YES |  | `NULL` |
| `pay_date` | `date` | NO | MUL | `NULL` |
| `submitted_by` | `varchar(100)` | NO |  | `NULL` |
| `submitted_at` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `pay_type` | `enum('Miscellaneous Work','Training or Bonus Pay','Class Related Non-Standard Pay','Livescan','Virtus','Reimbursement','Covid Related Pay')` | NO |  | `NULL` |
| `subtype` | `varchar(150)` | YES |  | `NULL` |
| `description` | `text` | YES |  | `NULL` |
| `location` | `varchar(200)` | YES |  | `NULL` |
| `program_id` | `int` | YES |  | `NULL` |
| `hourly_pay` | `decimal(8,2)` | YES |  | `NULL` |
| `hours` | `decimal(6,2)` | YES |  | `NULL` |
| `total_pay` | `decimal(8,2)` *(STORED GENERATED)* | YES |  | `NULL` |
| `manual_total_override` | `decimal(8,2)` | YES |  | `NULL` |
| `dollar_amount` | `decimal(8,2)` | YES |  | `NULL` |
| `total_reimbursement` | `decimal(8,2)` | NO |  | `0.00` |
| `is_reviewed` | `tinyint(1)` | NO | MUL | `0` |
| `reviewed_by` | `varchar(100)` | YES |  | `NULL` |
| `reviewed_at` | `datetime` | YES |  | `NULL` |
| `review_notes` | `text` | YES |  | `NULL` |

**Foreign Keys:**

- `professor_id` → `professor.id` *(misc_pay_entries_ibfk_1)*

## payroll_runs_pes

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `start_date` | `date` | NO | MUL | `NULL` |
| `end_date` | `date` | NO |  | `NULL` |
| `status` | `enum('Draft','Processing','Complete')` | NO |  | `Draft` |
| `gusto_csv_generated_at` | `datetime` | YES |  | `NULL` |
| `gusto_csv_path` | `varchar(500)` | YES |  | `NULL` |
| `processed_by` | `varchar(100)` | YES |  | `NULL` |
| `notes` | `text` | YES |  | `NULL` |
| `created_at` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `updated_at` | `datetime` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |

## payroll_runs_rocketology

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `start_date` | `date` | NO | MUL | `NULL` |
| `end_date` | `date` | NO |  | `NULL` |
| `status` | `enum('Draft','Processing','Complete')` | NO |  | `Draft` |
| `gusto_csv_generated_at` | `datetime` | YES |  | `NULL` |
| `gusto_csv_path` | `varchar(500)` | YES |  | `NULL` |
| `processed_by` | `varchar(100)` | YES |  | `NULL` |
| `notes` | `text` | YES |  | `NULL` |
| `created_at` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `updated_at` | `datetime` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |

## payroll_summary_pes

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `payroll_run_id` | `int` | NO | MUL | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `gusto_employee_id` | `varchar(10)` | NO |  | `NULL` |
| `last_name` | `varchar(100)` | NO |  | `NULL` |
| `first_name` | `varchar(100)` | NO |  | `NULL` |
| `employment_title` | `varchar(100)` | NO |  | `NULL` |
| `regular_hours` | `decimal(8,2)` | NO |  | `0.00` |
| `bonus` | `decimal(10,2)` | NO |  | `0.00` |
| `reimbursement` | `decimal(10,2)` | NO |  | `0.00` |
| `pto_hours` | `decimal(6,2)` | NO |  | `0.00` |
| `sick_hours` | `decimal(6,2)` | NO |  | `0.00` |
| `live_program_pay` | `decimal(10,2)` | NO |  | `0.00` |
| `party_pay` | `decimal(10,2)` | NO |  | `0.00` |
| `misc_pay` | `decimal(10,2)` | NO |  | `0.00` |
| `onboarding_pay` | `decimal(10,2)` | NO |  | `0.00` |
| `total_gross_pay` | `decimal(10,2)` | NO |  | `0.00` |
| `total_reimbursement` | `decimal(10,2)` | NO |  | `0.00` |
| `has_missing_assist_pay` | `tinyint(1)` | NO |  | `0` |
| `has_errors` | `tinyint(1)` | NO | MUL | `0` |
| `error_notes` | `text` | YES |  | `NULL` |
| `calculated_at` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `payroll_run_id` → `payroll_runs_pes.id` *(payroll_summary_pes_ibfk_1)*
- `professor_id` → `professor.id` *(payroll_summary_pes_ibfk_2)*

## payroll_summary_rocketology

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `payroll_run_id` | `int` | NO | MUL | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `gusto_employee_id` | `varchar(10)` | NO |  | `NULL` |
| `last_name` | `varchar(100)` | NO |  | `NULL` |
| `first_name` | `varchar(100)` | NO |  | `NULL` |
| `employment_title` | `varchar(100)` | NO |  | `NULL` |
| `regular_hours` | `decimal(8,2)` | NO |  | `0.00` |
| `bonus` | `decimal(10,2)` | NO |  | `0.00` |
| `reimbursement` | `decimal(10,2)` | NO |  | `0.00` |
| `pto_hours` | `decimal(6,2)` | NO |  | `0.00` |
| `sick_hours` | `decimal(6,2)` | NO |  | `0.00` |
| `live_program_pay` | `decimal(10,2)` | NO |  | `0.00` |
| `party_pay` | `decimal(10,2)` | NO |  | `0.00` |
| `misc_pay` | `decimal(10,2)` | NO |  | `0.00` |
| `onboarding_pay` | `decimal(10,2)` | NO |  | `0.00` |
| `total_gross_pay` | `decimal(10,2)` | NO |  | `0.00` |
| `total_reimbursement` | `decimal(10,2)` | NO |  | `0.00` |
| `has_missing_assist_pay` | `tinyint(1)` | NO |  | `0` |
| `has_errors` | `tinyint(1)` | NO | MUL | `0` |
| `error_notes` | `text` | YES |  | `NULL` |
| `calculated_at` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `payroll_run_id` → `payroll_runs_rocketology.id` *(payroll_summary_rocketology_ibfk_1)*
- `professor_id` → `professor.id` *(payroll_summary_rocketology_ibfk_2)*

# Invoicing & Billing

## contract_permit_required

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `contract_permit_required_name` | `char(64)` | NO | UNI | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## cut_type

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `cut_type_name` | `char(64)` | NO | UNI | `NULL` |
| `cut_type_unit` | `char(16)` | NO |  | `NULL` |
| `manual` | `tinyint(1)` | NO |  | `NULL` |
| `formula` | `tinyint(1)` | NO |  | `NULL` |
| `one_time_fixed` | `tinyint(1)` | NO |  | `NULL` |
| `recurring` | `tinyint(1)` | NO |  | `NULL` |
| `recurring_per_student` | `tinyint(1)` | NO |  | `NULL` |
| `recurring_per_hour` | `tinyint(1)` | NO |  | `NULL` |
| `recurring_per_date` | `tinyint(1)` | NO |  | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## invoice_payment

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `invoice_record_id` | `int` | NO | MUL | `NULL` |
| `payment_date` | `date` | NO |  | `NULL` |
| `amount` | `decimal(10,2)` | NO |  | `NULL` |
| `payment_notes` | `varchar(512)` | YES |  | `NULL` |
| `recorded_by_user_id` | `int` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `invoice_record_id` → `invoice_record.id` *(invoice_payment_ibfk_1)*

## invoice_record

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `invoice_number` | `int` | NO |  | `NULL` |
| `invoice_type` | `enum('Monthly','Non-Monthly')` | NO |  | `NULL` |
| `contractor_id` | `int` | YES | MUL | `NULL` |
| `location_id` | `int` | YES | MUL | `NULL` |
| `billing_month` | `varchar(32)` | YES |  | `NULL` |
| `billing_period_start` | `date` | YES |  | `NULL` |
| `billing_period_end` | `date` | YES |  | `NULL` |
| `invoice_date` | `date` | NO |  | `NULL` |
| `due_date` | `date` | NO |  | `NULL` |
| `memo` | `varchar(255)` | YES |  | `NULL` |
| `customer_name` | `varchar(255)` | NO |  | `NULL` |
| `total_amount` | `decimal(10,2)` | NO |  | `NULL` |
| `amount_paid` | `decimal(10,2)` | NO |  | `0.00` |
| `is_paid` | `tinyint(1)` | NO | MUL | `0` |
| `sent` | `tinyint(1)` | NO |  | `0` |
| `sent_at` | `date` | YES |  | `NULL` |
| `qb_invoice_number` | `int` | YES |  | `NULL` |
| `notes` | `text` | YES |  | `NULL` |
| `created_by_user_id` | `int` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |
| `qb_invoice_id` | `varchar(50)` | YES |  | `NULL` |
| `qb_balance` | `decimal(10,2)` | YES |  | `NULL` |
| `qb_status` | `varchar(30)` | YES |  | `NULL` |
| `qb_last_synced` | `datetime` | YES |  | `NULL` |

## invoice_record_program

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `invoice_record_id` | `int` | NO | MUL | `NULL` |
| `program_id` | `int` | NO | MUL | `NULL` |
| `line_amount` | `decimal(10,2)` | NO |  | `NULL` |
| `include_lab_fee` | `tinyint(1)` | NO |  | `0` |
| `lab_fee_amount` | `decimal(10,2)` | NO |  | `0.00` |
| `status` | `enum('completed','in_progress')` | NO |  | `in_progress` |
| `notes` | `varchar(512)` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `invoice_record_id` → `invoice_record.id` *(invoice_record_program_ibfk_1)*
- `program_id` → `program.id` *(invoice_record_program_ibfk_2)*

## our_cut_type

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `cut_type_name` | `char(64)` | NO | UNI | `NULL` |
| `cut_type_unit` | `char(16)` | NO |  | `NULL` |
| `manual` | `tinyint(1)` | NO |  | `NULL` |
| `formula` | `tinyint(1)` | NO |  | `NULL` |
| `one_time_fixed` | `tinyint(1)` | NO |  | `NULL` |
| `recurring` | `tinyint(1)` | NO |  | `NULL` |
| `recurring_per_student` | `tinyint(1)` | NO |  | `NULL` |
| `recurring_per_hour` | `tinyint(1)` | NO |  | `NULL` |
| `recurring_per_date` | `tinyint(1)` | NO |  | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## qb_token

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` | NO | PRI | `1` |
| `access_token` | `text` | YES |  | `NULL` |
| `refresh_token` | `text` | YES |  | `NULL` |
| `realm_id` | `varchar(50)` | YES |  | `NULL` |
| `token_type` | `varchar(20)` | YES |  | `NULL` |
| `expires_at` | `datetime` | YES |  | `NULL` |
| `refresh_expires_at` | `datetime` | YES |  | `NULL` |
| `updated_at` | `datetime` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | YES |  | `CURRENT_TIMESTAMP` |

# Shipping & Materials

## bin

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `bin_name` | `char(64)` | NO | UNI | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## has_bin

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `bin_id` | `int` | NO | MUL | `NULL` |
| `bin_number` | `int` | YES |  | `NULL` |
| `comment` | `varchar(1024)` | NO |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |

**Foreign Keys:**

- `bin_id` → `bin.id` *(has_bin_bin)*
- `professor_id` → `professor.id` *(has_bin_professor)*

## mapping_id

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `table_name` | `varchar(32)` | NO | PRI | `NULL` |
| `old_id` | `int` | NO | PRI | `NULL` |
| `new_id` | `int` | NO |  | `NULL` |

## shipment_cycle

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `cycle_type` | `enum('standard','mid_cycle','camp')` | NO |  | `NULL` |
| `start_date` | `date` | NO |  | `NULL` |
| `end_date` | `date` | NO |  | `NULL` |
| `ship_date` | `date` | NO |  | `NULL` |
| `approval_date` | `date` | YES |  | `NULL` |
| `status` | `enum('draft','approved','shipped','complete')` | NO |  | `draft` |
| `notes` | `text` | YES |  | `NULL` |
| `created_by_user_id` | `int` | YES |  | `NULL` |
| `created_at` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |
| `updated_at` | `datetime` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | YES |  | `CURRENT_TIMESTAMP` |

## shipment_exclusion_rule

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `rule_name` | `varchar(128)` | NO |  | `NULL` |
| `rule_type` | `enum('class_type_skip','min_weeks_id_card','min_weeks_degree','custom')` | NO |  | `NULL` |
| `class_type_id` | `int` | YES |  | `NULL` |
| `min_weeks` | `int` | YES |  | `NULL` |
| `description` | `text` | YES |  | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## shipment_order

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `cycle_id` | `int` | NO | MUL | `NULL` |
| `professor_id` | `int` | NO |  | `NULL` |
| `order_name` | `varchar(200)` | NO |  | `NULL` |
| `status` | `enum('pending','shipped','cancelled')` | NO |  | `pending` |
| `shipped_at` | `datetime` | YES |  | `NULL` |
| `shipped_by_user_id` | `int` | YES |  | `NULL` |
| `inflow_order_number` | `varchar(100)` | YES |  | `NULL` |
| `tracking_number` | `varchar(200)` | YES |  | `NULL` |
| `tracking_imported_at` | `datetime` | YES |  | `NULL` |
| `notes` | `text` | YES |  | `NULL` |
| `created_at` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |
| `updated_at` | `datetime` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | YES |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `cycle_id` → `shipment_cycle.id` *(shipment_order_ibfk_1)*

## shipment_order_line

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `order_id` | `int` | NO | MUL | `NULL` |
| `program_id` | `int` | YES |  | `NULL` |
| `lesson_id` | `int` | YES |  | `NULL` |
| `item_name` | `varchar(200)` | NO |  | `NULL` |
| `item_type` | `enum('lesson','bin','degree','id_card','start_kit','party_kit','camp_kit','camp_consumable','camp_coordinator_kit')` | NO |  | `NULL` |
| `quantity` | `int` | NO |  | `1` |
| `quantity_override` | `int` | YES |  | `NULL` |
| `sku` | `varchar(100)` | YES |  | `NULL` |
| `skip_flag` | `tinyint(1)` | NO |  | `0` |
| `source` | `enum('standard_cycle','mid_cycle','party','camp','manual')` | NO |  | `NULL` |
| `notes` | `varchar(512)` | YES |  | `NULL` |
| `created_at` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `order_id` → `shipment_order.id` *(shipment_order_line_ibfk_1)*

## shipment_resolution

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `order_line_id` | `int` | NO | MUL | `NULL` |
| `resolution` | `enum('dropped_by_field_manager','request_to_ship','catapult_kit_used','car_kit_substitute','not_needed_has_enough','other','ship_next_scheduled','acknowledged','shipped')` | NO |  | `NULL` |
| `quantity_resolved` | `int` | YES |  | `NULL` |
| `notes` | `text` | YES |  | `NULL` |
| `resolved_by_user_id` | `int` | YES |  | `NULL` |
| `resolved_at` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `order_line_id` → `shipment_order_line.id` *(shipment_resolution_ibfk_1)*

## stock_level

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `item_name` | `varchar(200)` | NO |  | `NULL` |
| `sku` | `varchar(100)` | NO | UNI | `NULL` |
| `qty_on_hand` | `int` | NO |  | `0` |
| `last_updated_at` | `datetime` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | YES |  | `CURRENT_TIMESTAMP` |
| `updated_by_user_id` | `int` | YES |  | `NULL` |

# Users, Roles & Access

## report

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `name` | `varchar(200)` | NO |  | `NULL` |
| `description` | `text` | YES |  | `NULL` |
| `entity` | `varchar(50)` | NO |  | `NULL` |
| `filters` | `json` | YES |  | `NULL` |
| `display_mode` | `enum('task','kpi','both')` | NO |  | `task` |
| `kpi_format` | `enum('count','sum','list')` | YES |  | `count` |
| `kpi_field` | `varchar(100)` | YES |  | `NULL` |
| `sort_order` | `int` | YES |  | `0` |
| `created_by` | `varchar(100)` | YES |  | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |
| `created_at` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |
| `updated_at` | `datetime` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | YES |  | `CURRENT_TIMESTAMP` |

## report_field_config

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `entity` | `varchar(64)` | NO | MUL | `NULL` |
| `field_key` | `varchar(64)` | NO |  | `NULL` |
| `enabled` | `tinyint(1)` | NO |  | `1` |

## report_role

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `report_id` | `int` | NO | MUL | `NULL` |
| `role_id` | `int` | NO |  | `NULL` |

**Foreign Keys:**

- `report_id` → `report.id` *(report_role_ibfk_1)*

## report_user

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `report_id` | `int` | NO | MUL | `NULL` |
| `user_id` | `int` | NO |  | `NULL` |

**Foreign Keys:**

- `report_id` → `report.id` *(report_user_ibfk_1)*

## role

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `role_name` | `char(64)` | NO | UNI | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## tool

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `path` | `varchar(128)` | NO | UNI | `NULL` |
| `label` | `varchar(128)` | NO |  | `NULL` |
| `nav_group` | `varchar(64)` | YES |  | `NULL` |
| `sort_order` | `int` | YES |  | `0` |
| `universal` | `tinyint(1)` | YES |  | `0` |
| `active` | `tinyint(1)` | YES |  | `1` |

## tool_role

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `tool_id` | `int` | NO | MUL | `NULL` |
| `role_id` | `int` | NO |  | `NULL` |

## user

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `first_name` | `char(64)` | NO |  | `NULL` |
| `last_name` | `char(64)` | NO |  | `NULL` |
| `email` | `char(128)` | NO | UNI | `NULL` |
| `user_name` | `char(64)` | NO | UNI | `NULL` |
| `password` | `char(64)` | NO |  | `NULL` |
| `role_id` | `int` | YES | MUL | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |
| `google_id` | `varchar(255)` | YES |  | `NULL` |
| `google_refresh_token` | `text` | YES |  | `NULL` |
| `last_login_at` | `datetime` | YES |  | `NULL` |
| `password_plain` | `varchar(100)` | YES |  | `NULL` |
| `email_signature` | `text` | YES |  | `NULL` |

**Foreign Keys:**

- `role_id` → `role.id` *(user_role)*

## user_column_preference

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `user_id` | `int` | NO | MUL | `NULL` |
| `page_key` | `varchar(64)` | NO |  | `NULL` |
| `visible_columns` | `json` | NO |  | `NULL` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |

## user_responsibility

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `user_id` | `int` | NO | MUL | `NULL` |
| `responsibility` | `varchar(50)` | NO |  | `NULL` |
| `geographic_area_id` | `int` | YES | MUL | `NULL` |
| `active` | `tinyint(1)` | YES |  | `1` |
| `ts_inserted` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `user_id` → `user.id` *(user_responsibility_ibfk_1)*
- `geographic_area_id` → `geographic_area.id` *(user_responsibility_ibfk_2)*

# Notifications & Comms

## client_email_log

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `tool_category` | `varchar(64)` | NO | MUL | `NULL` |
| `program_id` | `int` | YES | MUL | `NULL` |
| `location_id` | `int` | YES | MUL | `NULL` |
| `sent_at` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `sent_by_user_id` | `int` | YES | MUL | `NULL` |
| `recipient_email` | `varchar(512)` | YES |  | `NULL` |
| `template_id` | `int` | YES |  | `NULL` |
| `test_mode` | `tinyint(1)` | YES |  | `0` |
| `notes` | `text` | YES |  | `NULL` |

**Foreign Keys:**

- `program_id` → `program.id` *(client_email_log_ibfk_1)*
- `location_id` → `location.id` *(client_email_log_ibfk_2)*
- `sent_by_user_id` → `user.id` *(client_email_log_ibfk_3)*

## email_template

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `name` | `varchar(128)` | NO |  | `NULL` |
| `subject` | `varchar(512)` | NO |  | `NULL` |
| `body_html` | `text` | NO |  | `NULL` |
| `category` | `varchar(64)` | YES |  | `NULL` |
| `sort_order` | `int` | NO |  | `0` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |
| `requirement_id` | `int` | YES |  | `NULL` |
| `attachments` | `json` | YES |  | `NULL` |

## notification_log

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `notification_type` | `enum('class','party','observation','party_observation','custom')` | NO | MUL | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `session_id` | `int` | YES | MUL | `NULL` |
| `party_id` | `int` | YES |  | `NULL` |
| `phone_number` | `varchar(20)` | NO | MUL | `NULL` |
| `message_body` | `text` | NO |  | `NULL` |
| `twilio_sid` | `varchar(64)` | YES |  | `NULL` |
| `send_status` | `enum('pending','sent','failed')` | NO |  | `pending` |
| `confirm_status` | `enum('unconfirmed','confirmed','declined')` | NO |  | `unconfirmed` |
| `confirmed_at` | `datetime` | YES |  | `NULL` |
| `response_message` | `varchar(1024)` | YES |  | `NULL` |
| `notification_date` | `date` | NO | MUL | `NULL` |
| `sent_at` | `datetime` | YES |  | `NULL` |
| `sent_by` | `int` | YES | MUL | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |

**Foreign Keys:**

- `professor_id` → `professor.id` *(fk_notif_professor)*
- `sent_by` → `user.id` *(fk_notif_sent_by)*
- `session_id` → `session.id` *(fk_notif_session)*

## sms_template

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `name` | `varchar(100)` | NO |  | `NULL` |
| `category` | `enum('class_lead','class_assistant','party_lead','party_observe','observation')` | NO |  | `NULL` |
| `body` | `text` | NO |  | `NULL` |
| `is_default` | `tinyint(1)` | NO |  | `0` |
| `active` | `tinyint(1)` | NO |  | `1` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |

## twilio_response

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `twilio_sid` | `varchar(50)` | YES |  | `NULL` |
| `response_sid` | `varchar(50)` | YES | MUL | `NULL` |
| `from_phone` | `varchar(20)` | YES |  | `NULL` |
| `professor_id` | `int` | YES |  | `NULL` |
| `professor_name` | `varchar(128)` | YES |  | `NULL` |
| `body` | `text` | YES |  | `NULL` |
| `match_status` | `enum('confirmed','no_outstanding','unrecognized_response','unknown_sender','ignored')` | YES |  | `unknown_sender` |
| `matched_count` | `int` | YES |  | `0` |
| `received_at` | `datetime` | YES |  | `NULL` |
| `created_at` | `datetime` *(DEFAULT_GENERATED)* | YES | MUL | `CURRENT_TIMESTAMP` |

# HR & Compliance

## audit_log

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `table_name` | `varchar(50)` | NO | MUL | `NULL` |
| `record_id` | `int` | NO |  | `NULL` |
| `user_id` | `int` | YES | MUL | `NULL` |
| `user_name` | `varchar(100)` | YES |  | `NULL` |
| `action` | `enum('create','update','delete')` | YES |  | `update` |
| `changes` | `json` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | YES | MUL | `CURRENT_TIMESTAMP` |

## bug_report

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `description` | `text` | NO |  | `NULL` |
| `page_url` | `varchar(512)` | YES |  | `NULL` |
| `page_name` | `varchar(100)` | YES |  | `NULL` |
| `submitted_by_user_id` | `int` | YES | MUL | `NULL` |
| `submitted_by_name` | `varchar(100)` | YES |  | `NULL` |
| `status` | `enum('new','approved_minor','approved_major','rejected','fixed')` | YES | MUL | `new` |
| `admin_notes` | `varchar(512)` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |

## day_off

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `date_requested` | `date` | NO |  | `NULL` |
| `notes` | `varchar(1024)` | YES |  | `NULL` |
| `substitute_reason_id` | `int` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |

**Foreign Keys:**

- `professor_id` → `professor.id` *(day_off_professor)*

## holiday

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `holiday_name` | `char(64)` | NO | MUL | `NULL` |
| `holiday_date` | `date` | NO |  | `NULL` |
| `generic` | `tinyint(1)` | NO |  | `NULL` |
| `jewish` | `tinyint(1)` | NO |  | `NULL` |

## incident

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `incident_date` | `date` | YES |  | `NULL` |
| `notes` | `varchar(1024)` | YES |  | `NULL` |
| `link` | `varchar(1024)` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |

**Foreign Keys:**

- `professor_id` → `professor.id` *(incident_professor)*

## incident_note

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `incident_id` | `int` | NO | MUL | `NULL` |
| `user_id` | `int` | NO | MUL | `NULL` |
| `note` | `text` | NO |  | `NULL` |
| `tagged_user_id` | `int` | YES | MUL | `NULL` |
| `ts_inserted` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `incident_id` → `incident_report.id` *(incident_note_ibfk_1)*
- `user_id` → `user.id` *(incident_note_ibfk_2)*
- `tagged_user_id` → `user.id` *(incident_note_ibfk_3)*

## incident_report

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `program_id` | `int` | YES | MUL | `NULL` |
| `location_id` | `int` | YES | MUL | `NULL` |
| `site_name` | `varchar(255)` | YES |  | `NULL` |
| `incident_date` | `date` | NO |  | `NULL` |
| `incident_time` | `varchar(20)` | YES |  | `NULL` |
| `report_date` | `date` *(DEFAULT_GENERATED)* | NO |  | `curdate()` |
| `severity` | `enum('minor','major')` | NO |  | `minor` |
| `category_physical` | `tinyint(1)` | YES |  | `0` |
| `category_verbal` | `tinyint(1)` | YES |  | `0` |
| `category_accident` | `tinyint(1)` | YES |  | `0` |
| `category_behavior` | `tinyint(1)` | YES |  | `0` |
| `category_illness` | `tinyint(1)` | YES |  | `0` |
| `category_injury` | `tinyint(1)` | YES |  | `0` |
| `category_bullying` | `tinyint(1)` | YES |  | `0` |
| `professors_involved` | `text` | YES |  | `NULL` |
| `students_involved` | `text` | YES |  | `NULL` |
| `description` | `text` | NO |  | `NULL` |
| `reviewed` | `tinyint(1)` | YES | MUL | `0` |
| `review_status` | `enum('pending','acknowledged','in_progress','resolved')` | YES |  | `pending` |
| `reviewed_by_user_id` | `int` | YES | MUL | `NULL` |
| `reviewed_at` | `datetime` | YES |  | `NULL` |
| `review_notes` | `text` | YES |  | `NULL` |
| `resolution` | `text` | YES |  | `NULL` |
| `active` | `tinyint(1)` | YES |  | `1` |
| `ts_inserted` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |

**Foreign Keys:**

- `professor_id` → `professor.id` *(incident_report_ibfk_1)*
- `program_id` → `program.id` *(incident_report_ibfk_2)*
- `location_id` → `location.id` *(incident_report_ibfk_3)*
- `reviewed_by_user_id` → `user.id` *(incident_report_ibfk_4)*

## review

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `review_date` | `date` | YES |  | `NULL` |
| `notes` | `varchar(1024)` | YES |  | `NULL` |
| `link` | `varchar(1024)` | YES |  | `NULL` |
| `ts_inserted` | `timestamp` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `ts_updated` | `timestamp` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | NO |  | `CURRENT_TIMESTAMP` |
| `active` | `tinyint(1)` | NO |  | `1` |

**Foreign Keys:**

- `professor_id` → `professor.id` *(review_professor)*

## sub_claim

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `session_id` | `int` | NO | MUL | `NULL` |
| `professor_id` | `int` | NO | MUL | `NULL` |
| `role` | `enum('Lead','Assistant')` | NO |  | `Lead` |
| `status` | `enum('pending','approved','rejected')` | NO | MUL | `pending` |
| `expected_pay` | `decimal(8,2)` | YES |  | `NULL` |
| `claimed_at` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |
| `reviewed_by` | `int` | YES |  | `NULL` |
| `reviewed_at` | `datetime` | YES |  | `NULL` |
| `reject_reason` | `varchar(255)` | YES |  | `NULL` |
| `active` | `tinyint(1)` | NO |  | `1` |

## substitute_reason

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `reason_name` | `varchar(100)` | NO |  | `NULL` |
| `sort_order` | `int` | YES |  | `0` |
| `active` | `tinyint(1)` | YES |  | `1` |

# System & Config

## app_setting

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `setting_key` | `varchar(100)` | NO | PRI | `NULL` |
| `setting_value` | `text` | YES |  | `NULL` |
| `updated_at` | `datetime` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | YES |  | `CURRENT_TIMESTAMP` |

## app_settings

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `setting_key` | `varchar(100)` | NO | PRI | `NULL` |
| `setting_value` | `varchar(500)` | NO |  | `NULL` |
| `updated_at` | `datetime` *(DEFAULT_GENERATED on update CURRENT_TIMESTAMP)* | YES |  | `CURRENT_TIMESTAMP` |
| `updated_by` | `varchar(100)` | YES |  | `NULL` |

## nightly_job_logs

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `run_date` | `date` | NO |  | `NULL` |
| `programs_processed` | `int` | NO |  | `0` |
| `sessions_written` | `int` | NO |  | `0` |
| `errors` | `int` | NO |  | `0` |
| `error_details` | `text` | YES |  | `NULL` |
| `duration_ms` | `int` | YES |  | `NULL` |
| `created_at` | `datetime` *(DEFAULT_GENERATED)* | NO |  | `CURRENT_TIMESTAMP` |

## system_setting

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `setting_key` | `varchar(100)` | NO | PRI | `NULL` |
| `setting_value` | `text` | YES |  | `NULL` |
| `description` | `varchar(255)` | YES |  | `NULL` |
| `ts_updated` | `datetime` *(DEFAULT_GENERATED)* | YES |  | `CURRENT_TIMESTAMP` |

## weekday

| Column | Type | Null | Key | Default |
|--------|------|------|-----|---------|
| `id` | `int` *(auto_increment)* | NO | PRI | `NULL` |
| `weekday_name` | `char(16)` | NO | UNI | `NULL` |

