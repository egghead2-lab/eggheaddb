## availability
  id | int | PK | NOT NULL
  professor_id | int | FK | NOT NULL
  weekday_id | int | FK | NOT NULL
  time_from | time
  time_to | time
  notes | varchar(1024) | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (629 rows)

## bin
  id | int | PK | NOT NULL
  bin_name | char(64) | UNIQUE | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (8 rows)

## candidate
  id | int | PK | NOT NULL
  full_name | varchar(128) | NOT NULL
  email | varchar(128) | UNIQUE | NOT NULL
  phone | varchar(64)
  status | enum('pending','in_progress','complete','rejected','hired') | NOT NULL | default=pending
  geographic_area_id | int
  onboarder_user_id | int
  trainer_user_id | int
  recruiter_user_id | int
  first_class_date | date
  accepted_at | datetime
  professor_id | int
  user_id | int
  notes | text
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  address | varchar(256)
  city | varchar(64)
  state | varchar(2)
  zip | varchar(16)
  shirt_size | varchar(16)
  availability_notes | text
  how_heard | varchar(128)
  resume_link | varchar(512)
  scheduling_coordinator_user_id | int
  field_manager_user_id | int
  schedule_ready | tinyint(1) | default=0
  schedule_confirmed_at | datetime
  schedule_changed_since_confirm | tinyint(1) | default=0
  lead_pay | decimal(10,2)
  assist_pay | decimal(10,2)
  (1 rows)

## candidate_applied_template
  id | int | PK | NOT NULL
  candidate_id | int | FK | NOT NULL
  template_id | int | FK | NOT NULL
  applied_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  applied_by_user_id | int
  (3 rows)

## candidate_availability
  id | int | PK | NOT NULL
  candidate_id | int | UNIQUE | NOT NULL
  monday | tinyint(1) | NOT NULL | default=0
  monday_notes | varchar(128)
  tuesday | tinyint(1) | NOT NULL | default=0
  tuesday_notes | varchar(128)
  wednesday | tinyint(1) | NOT NULL | default=0
  wednesday_notes | varchar(128)
  thursday | tinyint(1) | NOT NULL | default=0
  thursday_notes | varchar(128)
  friday | tinyint(1) | NOT NULL | default=0
  friday_notes | varchar(128)
  saturday | tinyint(1) | NOT NULL | default=0
  saturday_notes | varchar(128)
  sunday | tinyint(1) | NOT NULL | default=0
  sunday_notes | varchar(128)
  additional_notes | text
  personal_info_completed | tinyint(1) | NOT NULL | default=0
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  (1 rows)

## candidate_document
  id | int | PK | NOT NULL
  candidate_id | int | FK | NOT NULL
  candidate_requirement_id | int
  file_name | varchar(255) | NOT NULL
  file_size | int
  mime_type | varchar(128)
  storage_path | varchar(512) | NOT NULL
  uploaded_by_user_id | int
  uploaded_by_candidate | tinyint(1) | NOT NULL | default=0
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  (3 rows)

## candidate_email
  id | int | PK | NOT NULL
  candidate_id | int | FK | NOT NULL
  gmail_thread_id | varchar(128)
  gmail_message_id | varchar(128)
  subject | varchar(512)
  from_email | varchar(256)
  to_email | varchar(256)
  body_html | text
  body_text | text
  direction | enum('sent','received') | NOT NULL | default=sent
  sent_by_user_id | int
  sent_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  (1 rows)

## candidate_message
  id | int | PK | NOT NULL
  candidate_id | int | FK | NOT NULL
  sent_by_user_id | int | FK
  body | text | NOT NULL
  is_from_candidate | tinyint(1) | default=0
  active | tinyint(1) | default=1
  ts_inserted | timestamp | default=CURRENT_TIMESTAMP
  (3 rows)

## candidate_note
  id | int | PK | NOT NULL
  candidate_id | int | FK | NOT NULL
  user_id | int | NOT NULL
  body | text | NOT NULL
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  (0 rows)

## candidate_requirement
  id | int | PK | NOT NULL
  candidate_id | int | FK | NOT NULL
  requirement_id | int | FK | NOT NULL
  completed | tinyint(1) | NOT NULL | default=0
  completed_at | datetime
  completed_by_user_id | int
  assigned_to_user_id | int
  due_date | date
  status | enum('not_started','in_progress','complete','overdue','waived') | NOT NULL | default=not_started
  notes | text
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  assigned_role | enum('scheduler','field_manager','recruiter','onboarder','trainer')
  needs_approval | tinyint(1) | NOT NULL | default=0
  approval_status | enum('not_needed','pending_approval','approved','rejected') | NOT NULL | default=not_needed
  approved_by_user_id | int
  approved_at | datetime
  waived | tinyint(1) | default=0
  waived_reason | varchar(255)
  (5 rows)

## candidate_schedule
  id | int | PK | NOT NULL
  candidate_id | int | FK | NOT NULL
  program_id | int | FK | NOT NULL
  role | enum('Lead','Assistant') | default=Lead
  assigned_by_user_id | int
  status | enum('pending','ready','confirmed','changed') | default=pending
  confirmed_at | datetime
  notes | varchar(512)
  active | tinyint(1) | default=1
  ts_inserted | timestamp | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | default=CURRENT_TIMESTAMP
  (3 rows)

## candidate_task
  id | int | PK | NOT NULL
  candidate_id | int | FK | NOT NULL
  assigned_to_user_id | int
  created_by_user_id | int
  title | varchar(255) | NOT NULL
  description | text
  due_date | date
  completed | tinyint(1) | NOT NULL | default=0
  completed_at | datetime
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  (1 rows)

## city
  id | int | PK | NOT NULL
  city_name | char(64) | FK | NOT NULL
  zip_code | char(16) | UNIQUE | NOT NULL
  state_id | int | FK | NOT NULL
  geographic_area_id | int | FK | NOT NULL
  (474 rows)

## class
  id | int | PK | NOT NULL
  class_name | char(64) | UNIQUE | NOT NULL
  class_code | char(32) | UNIQUE | NOT NULL
  formal_class_name | char(128) | UNIQUE | NOT NULL
  description | text
  keywords | text
  standards | text
  trainual_link | varchar(512)
  parent_portal_link | varchar(512)
  parent_portal_qr_path | varchar(512)
  long_blurb | varchar(2048)
  short_blurb | varchar(1024)
  program_type_id | int | FK | NOT NULL
  class_type_id | int | FK | NOT NULL
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  (78 rows)

## class_pricing_type
  id | int | PK | NOT NULL
  class_pricing_type_name | char(64) | UNIQUE | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (2 rows)

## class_status
  id | int | PK | NOT NULL
  class_status_name | char(64) | UNIQUE | NOT NULL
  cancelled | tinyint(1) | NOT NULL
  confirmed | tinyint(1) | NOT NULL
  unconfirmed | tinyint(1) | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (7 rows)

## class_type
  id | int | PK | NOT NULL
  class_type_name | char(64) | UNIQUE | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (5 rows)

## contract_permit_required
  id | int | PK | NOT NULL
  contract_permit_required_name | char(64) | UNIQUE | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (10 rows)

## contractor
  id | int | PK | NOT NULL
  contractor_name | char(64) | UNIQUE | NOT NULL
  salesperson_user_id | int
  client_since | varchar(128)
  relationship_strength | varchar(64)
  rebooking_notes | text
  minimum_to_run | text
  last_price_raise | text
  key_contact_name | varchar(128)
  key_contact_email | varchar(256)
  key_contact_phone | varchar(64)
  day_of_notifications | text
  client_vibe | text
  livescan_multiple | tinyint(1) | NOT NULL
  livescan_required | tinyint(1) | default=0
  tb_required | tinyint(1) | default=0
  professor_misc_notes | text
  behavioral_guidelines | text
  area_demographic | text
  flexibility_notes | text
  invoice_notes | text
  last_updated | date
  general_notes | text
  active | tinyint(1) | NOT NULL | default=1
  (83 rows)

## cut_type
  id | int | PK | NOT NULL
  cut_type_name | char(64) | UNIQUE | NOT NULL
  cut_type_unit | char(16) | NOT NULL
  manual | tinyint(1) | NOT NULL
  formula | tinyint(1) | NOT NULL
  one_time_fixed | tinyint(1) | NOT NULL
  recurring | tinyint(1) | NOT NULL
  recurring_per_student | tinyint(1) | NOT NULL
  recurring_per_hour | tinyint(1) | NOT NULL
  recurring_per_date | tinyint(1) | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (9 rows)

## day_off
  id | int | PK | NOT NULL
  professor_id | int | FK | NOT NULL
  date_requested | date | NOT NULL
  notes | varchar(1024)
  substitute_reason_id | int
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  (1984 rows)

## default_grade
  id | int | PK | NOT NULL
  default_location_class_type_id | int | FK | NOT NULL
  grade_id | int | FK | NOT NULL
  age_min | decimal(3,1)
  age_max | decimal(3,1)
  (6539 rows)

## default_location_class_type
  id | int | PK | NOT NULL
  location_id | int | FK | NOT NULL
  class_type_id | int | FK | NOT NULL
  monday | tinyint(1) | NOT NULL
  tuesday | tinyint(1) | NOT NULL
  wednesday | tinyint(1) | NOT NULL
  thursday | tinyint(1) | NOT NULL
  friday | tinyint(1) | NOT NULL
  saturday | tinyint(1) | NOT NULL
  sunday | tinyint(1) | NOT NULL
  start_time | time
  length_minutes | int
  cost | decimal(10,2)
  cost_notes | char(255)
  lab_fee_type_id | int | FK
  lab_fee_amount | decimal(10,2)
  minimum_students | int
  maximum_students | int
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  (1862 rows)

## demo_type
  id | int | PK | NOT NULL
  demo_type_name | char(64) | UNIQUE | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (7 rows)

## email_template
  id | int | PK | NOT NULL
  name | varchar(128) | NOT NULL
  subject | varchar(512) | NOT NULL
  body_html | text | NOT NULL
  category | varchar(64)
  sort_order | int | NOT NULL | default=0
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  requirement_id | int
  (0 rows)

## evaluation_schedule
  id | int | PK | NOT NULL
  tier_name | varchar(50) | NOT NULL
  min_days_on_staff | int | NOT NULL
  max_days_on_staff | int
  frequency_days | int | NOT NULL
  sort_order | int | default=0
  active | tinyint(1) | default=1
  (3 rows)

## field_manager_payroll_rocketology
  id | int | PK | NOT NULL
  payroll_run_id | int | FK | NOT NULL
  professor_id | int | FK | NOT NULL
  gusto_employee_id | varchar(10) | NOT NULL
  last_name | varchar(100) | NOT NULL
  first_name | varchar(100) | NOT NULL
  employment_title | varchar(100) | NOT NULL | default=Field Manager (Primary)
  regular_hours | decimal(8,2) | NOT NULL | default=0.00
  bonus | decimal(10,2) | NOT NULL | default=0.00
  reimbursement | decimal(10,2) | NOT NULL | default=0.00
  pto_hours | decimal(6,2) | NOT NULL | default=0.00
  sick_hours | decimal(6,2) | NOT NULL | default=0.00
  calculated_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  (0 rows)

## field_manager_time_entries
  id | int | PK | NOT NULL
  professor_id | int | FK | NOT NULL
  work_date | date | FK | NOT NULL
  time_in | time | NOT NULL
  time_out | time | NOT NULL
  break_minutes | int | NOT NULL | default=0
  work_location | enum('field_majority','field_and_home','home')
  field_activities | text
  wfh_activities | text
  professors_contacted | text
  concerns | text
  total_hours | decimal(6,2)
  description | text
  submitted_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  is_approved | tinyint(1) | NOT NULL | default=0
  approved_by | varchar(100)
  approved_at | datetime
  (3 rows)

## geographic_area
  id | int | PK | NOT NULL
  geographic_area_name | char(64) | UNIQUE | NOT NULL
  scheduling_coordinator_user_id | int | FK
  field_manager_user_id | int | FK
  client_manager_user_id | int | FK
  active | tinyint(1) | NOT NULL | default=1
  sales_user_id | int
  recruiter_user_id | int
  onboarder_user_id | int
  client_specialist_user_id | int
  scheduling_specialist_user_id | int
  trainer_user_id | int
  region_id | int
  state_id | int
  (18 rows)

## grade
  id | int | PK | NOT NULL
  grade_name | char(64) | UNIQUE | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (15 rows)

## gusto_employee_codes
  id | int | PK | NOT NULL
  professor_id | int | FK | NOT NULL
  company | enum('Rocketology','PES') | NOT NULL
  gusto_employee_id | varchar(10) | UNIQUE | NOT NULL
  gusto_last_name | varchar(100) | NOT NULL
  gusto_first_name | varchar(100) | NOT NULL
  nickname | varchar(100)
  is_active | tinyint(1) | NOT NULL | default=1
  created_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  updated_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  (5 rows)

## has_bin
  id | int | PK | NOT NULL
  professor_id | int | FK | NOT NULL
  bin_id | int | FK | NOT NULL
  bin_number | int
  comment | varchar(1024) | NOT NULL
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  (920 rows)

## holiday
  id | int | PK | NOT NULL
  holiday_name | char(64) | FK | NOT NULL
  holiday_date | date | NOT NULL
  generic | tinyint(1) | NOT NULL
  jewish | tinyint(1) | NOT NULL
  (39 rows)

## incident
  id | int | PK | NOT NULL
  professor_id | int | FK | NOT NULL
  incident_date | date
  notes | varchar(1024)
  link | varchar(1024)
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  (276 rows)

## lab_fee_type
  id | int | PK | NOT NULL
  lab_fee_type_name | char(64) | UNIQUE | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (2 rows)

## lesson
  id | int | PK | NOT NULL
  lesson_name | char(64) | FK | NOT NULL
  trainual_link | varchar(512)
  description | text
  keywords | text
  parent_portal_link | varchar(512)
  parent_portal_qr_path | varchar(512)
  lesson_type | enum('science','engineering','robotics','financial_literacy')
  class_id | int | FK
  status_one_sheet | enum('up_to_date','update_needed')
  status_materials | enum('up_to_date','update_needed')
  status_video | enum('up_to_date','update_needed')
  status_trainual | enum('up_to_date','update_needed')
  status_standards | enum('up_to_date','update_needed')
  status_science_accuracy | enum('up_to_date','update_needed')
  last_reviewed | date
  next_update_required | date
  review_status | enum('okay','review','overdue')
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  (227 rows)

## lesson_class
  id | int | PK | NOT NULL
  lesson_id | int | FK | NOT NULL
  class_id | int | NOT NULL
  camp_type | enum('full_day','half_day')
  active | tinyint(1) | NOT NULL | default=1
  ts_inserted | timestamp | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | default=CURRENT_TIMESTAMP
  sort_order | int | NOT NULL | default=0
  (226 rows)

## livescan
  id | int | PK | NOT NULL
  location_id | int | FK
  professor_id | int | FK | NOT NULL
  livescan_date | date
  livescan_link | varchar(1024)
  notes | varchar(1024)
  pass | tinyint(1) | NOT NULL
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  contractor_id | int | FK
  (394 rows)

## location
  id | int | PK | NOT NULL
  nickname | char(128) | UNIQUE | NOT NULL
  school_name | char(128) | NOT NULL
  payment_through_us | tinyint(1) | NOT NULL
  location_type_id | int | FK
  location_phone | char(32) | NOT NULL
  address | char(128) | NOT NULL
  city_id | int | FK
  geographic_area_id_online | int | FK
  point_of_contact | char(64)
  poc_title_id | int | FK
  poc_title | varchar(128)
  poc_phone | char(128)
  poc_email | char(128)
  contractor_id | int | FK
  location_enrollment | int
  demo_allowed | tinyint(1)
  demo_type_id | int | FK
  demo_pay | int
  demo_notes | varchar(1024)
  class_pricing_type_id | int | FK
  virtus_required | tinyint(1) | NOT NULL
  tb_required | tinyint(1) | NOT NULL
  livescan_required | tinyint(1) | NOT NULL
  livescan_info | varchar(1024)
  contract_permit_required | tinyint(1) | NOT NULL
  contract_permit_notes | char(255)
  special_info_required | char(255)
  flyer_required | tinyint(1) | NOT NULL
  registration_link_for_flyer | char(255)
  custom_flyer_required | tinyint(1) | NOT NULL
  custom_flyer_items_required | varchar(1024)
  flyer_quantity | int
  parking_difficulty_id | int | FK
  parking_information | varchar(1024)
  school_procedure_Info | varchar(1024)
  internal_notes | varchar(1024)
  observes_allowed | tinyint(1)
  jewish | tinyint(1)
  set_dates_ourselves | tinyint(1)
  number_of_weeks | int
  school_calendar_link | varchar(1024)
  invoicing_notes | varchar(1024)
  tbd | tinyint(1) | NOT NULL
  tbd_notes | varchar(1024)
  retained | tinyint(1) | NOT NULL | default=0
  client_manager_user_id | int
  site_coordinator_name | varchar(128)
  site_coordinator_email | varchar(256)
  site_coordinator_phone | varchar(64)
  site_coordinator_role | varchar(128)
  invoice_contact_name | varchar(128)
  invoice_contact_email | varchar(256)
  invoice_contact_phone | varchar(64)
  invoice_at_district | tinyint(1) | default=0
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  (2485 rows)

## location_cut_type
  id | int | PK | NOT NULL
  location_id | int | FK | NOT NULL
  cut_type_id | int | FK | NOT NULL
  amount | decimal(11,3)
  description | char(255)
  active | tinyint(1) | NOT NULL | default=1
  (198 rows)

## location_type
  id | int | PK | NOT NULL
  location_type_name | char(64) | UNIQUE | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (5 rows)

## mapping_id
  table_name | varchar(32) | PK | NOT NULL
  old_id | int | PK | NOT NULL
  new_id | int | NOT NULL
  (7629 rows)

## mileage_submissions
  id | int | PK | NOT NULL
  professor_id | int | FK | NOT NULL
  submission_date | date | NOT NULL
  miles_claimed | int | NOT NULL
  reimbursement_total | decimal(8,2) | NOT NULL
  pdf_link | varchar(500)
  submitted_by | varchar(100)
  submitted_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  is_processed | tinyint(1) | FK | NOT NULL | default=0
  processed_at | datetime
  (0 rows)

## misc_pay_entries
  id | int | PK | NOT NULL
  professor_id | int | FK
  professor_name_raw | varchar(200)
  pay_date | date | FK | NOT NULL
  submitted_by | varchar(100) | NOT NULL
  submitted_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  pay_type | enum('Miscellaneous Work','Training or Bonus Pay','Class Related Non-Standard Pay','Livescan','Virtus','Reimbursement','Covid Related Pay') | NOT NULL
  subtype | varchar(150)
  description | text
  location | varchar(200)
  program_id | int
  hourly_pay | decimal(8,2)
  hours | decimal(6,2)
  total_pay | decimal(8,2)
  manual_total_override | decimal(8,2)
  dollar_amount | decimal(8,2)
  total_reimbursement | decimal(8,2) | NOT NULL | default=0.00
  is_reviewed | tinyint(1) | FK | NOT NULL | default=0
  reviewed_by | varchar(100)
  reviewed_at | datetime
  review_notes | text
  (2 rows)

## nightly_job_logs
  id | int | PK | NOT NULL
  run_date | date | NOT NULL
  programs_processed | int | NOT NULL | default=0
  sessions_written | int | NOT NULL | default=0
  errors | int | NOT NULL | default=0
  error_details | text
  duration_ms | int
  created_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  (7 rows)

## observation_delete_reason
  id | int | PK | NOT NULL
  reason_name | varchar(100) | NOT NULL
  sort_order | int | default=0
  active | tinyint(1) | default=1
  (7 rows)

## onboard_status
  id | int | PK | NOT NULL
  onboard_status_name | char(64) | UNIQUE | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (5 rows)

## onboarding_pay_entries
  id | int | PK | NOT NULL
  professor_id | int | FK
  professor_name_raw | varchar(200)
  training_date | date | FK | NOT NULL
  trainer | varchar(100)
  submitted_by | varchar(100) | NOT NULL
  submitted_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  trainual_completed | tinyint(1) | NOT NULL | default=0
  modules_completed | int
  trainual_pay | decimal(8,2) | NOT NULL | default=35.00
  virtual_training_completed | tinyint(1) | NOT NULL | default=0
  virtual_training_pay | decimal(8,2) | NOT NULL | default=40.00
  total_training_pay | decimal(8,2)
  bg_check_completed | tinyint(1) | NOT NULL | default=0
  bg_check_cost | decimal(8,2) | NOT NULL | default=55.00
  training_outcome | enum('Passed to Scheduling','Will Not Complete Training','Lost Candidate') | NOT NULL
  terminate_upon_payment | tinyint(1) | NOT NULL | default=0
  is_rehire | tinyint(1) | NOT NULL | default=0
  is_reviewed | tinyint(1) | FK | NOT NULL | default=0
  reviewed_by | varchar(100)
  reviewed_at | datetime
  (0 rows)

## onboarding_requirement
  id | int | PK | NOT NULL
  title | varchar(255) | NOT NULL
  description | text
  category | varchar(64)
  type | enum('task','document','training','compliance') | NOT NULL | default=task
  requires_document | tinyint(1) | NOT NULL | default=0
  sort_order | int | NOT NULL | default=0
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  assigned_role | enum('scheduler','field_manager','recruiter','onboarder','trainer')
  email_template_id | int
  needs_approval | tinyint(1) | NOT NULL | default=0
  due_basis | enum('days_after_hire','days_before_hire','days_after_start','days_before_start')
  due_days | int
  (5 rows)

## onboarding_template
  id | int | PK | NOT NULL
  name | varchar(128) | NOT NULL
  description | text
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  (3 rows)

## onboarding_template_item
  id | int | PK | NOT NULL
  template_id | int | FK | NOT NULL
  requirement_id | int | FK | NOT NULL
  due_offset_days | int
  sort_order | int | NOT NULL | default=0
  (6 rows)

## our_cut_type
  id | int | PK | NOT NULL
  cut_type_name | char(64) | UNIQUE | NOT NULL
  cut_type_unit | char(16) | NOT NULL
  manual | tinyint(1) | NOT NULL
  formula | tinyint(1) | NOT NULL
  one_time_fixed | tinyint(1) | NOT NULL
  recurring | tinyint(1) | NOT NULL
  recurring_per_student | tinyint(1) | NOT NULL
  recurring_per_hour | tinyint(1) | NOT NULL
  recurring_per_date | tinyint(1) | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (9 rows)

## parent
  id | int | PK | NOT NULL
  first_name | char(64)
  last_name | char(64)
  city_id | int | FK
  address | char(128)
  email | char(128) | UNIQUE
  phone | char(128)
  user_name | char(64) | UNIQUE
  password | char(64)
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  (745 rows)

## parent_role
  id | int | PK | NOT NULL
  parent_role_name | char(64) | UNIQUE | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (2 rows)

## parking_difficulty
  id | int | PK | NOT NULL
  parking_difficulty_name | char(64) | UNIQUE | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (3 rows)

## party_format
  id | int | PK | NOT NULL
  party_format_name | varchar(100) | NOT NULL
  active | tinyint | NOT NULL | default=1
  ts_inserted | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  (9 rows)

## party_session_pay
  id | int | PK | NOT NULL
  party_id | int | FK | NOT NULL
  role | enum('Lead','Assistant') | NOT NULL
  professor_id | int | FK | NOT NULL
  pay_amount | decimal(8,2) | NOT NULL | default=0.00
  drive_fee | decimal(8,2) | NOT NULL | default=0.00
  tip_amount | decimal(8,2) | NOT NULL | default=0.00
  dry_ice_reimbursement | decimal(8,2) | NOT NULL | default=0.00
  total_reimbursement | decimal(8,2)
  reimbursements_paid | tinyint(1) | FK | NOT NULL | default=0
  is_late_reimbursement | tinyint(1) | NOT NULL | default=0
  late_reimbursement_notes | text
  created_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  updated_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  (0 rows)

## payroll_runs_pes
  id | int | PK | NOT NULL
  start_date | date | FK | NOT NULL
  end_date | date | NOT NULL
  status | enum('Draft','Processing','Complete') | NOT NULL | default=Draft
  gusto_csv_generated_at | datetime
  gusto_csv_path | varchar(500)
  processed_by | varchar(100)
  notes | text
  created_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  updated_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  (0 rows)

## payroll_runs_rocketology
  id | int | PK | NOT NULL
  start_date | date | FK | NOT NULL
  end_date | date | NOT NULL
  status | enum('Draft','Processing','Complete') | NOT NULL | default=Draft
  gusto_csv_generated_at | datetime
  gusto_csv_path | varchar(500)
  processed_by | varchar(100)
  notes | text
  created_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  updated_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  (1 rows)

## payroll_summary_pes
  id | int | PK | NOT NULL
  payroll_run_id | int | FK | NOT NULL
  professor_id | int | FK | NOT NULL
  gusto_employee_id | varchar(10) | NOT NULL
  last_name | varchar(100) | NOT NULL
  first_name | varchar(100) | NOT NULL
  employment_title | varchar(100) | NOT NULL
  regular_hours | decimal(8,2) | NOT NULL | default=0.00
  bonus | decimal(10,2) | NOT NULL | default=0.00
  reimbursement | decimal(10,2) | NOT NULL | default=0.00
  pto_hours | decimal(6,2) | NOT NULL | default=0.00
  sick_hours | decimal(6,2) | NOT NULL | default=0.00
  live_program_pay | decimal(10,2) | NOT NULL | default=0.00
  party_pay | decimal(10,2) | NOT NULL | default=0.00
  misc_pay | decimal(10,2) | NOT NULL | default=0.00
  onboarding_pay | decimal(10,2) | NOT NULL | default=0.00
  total_gross_pay | decimal(10,2) | NOT NULL | default=0.00
  total_reimbursement | decimal(10,2) | NOT NULL | default=0.00
  has_missing_assist_pay | tinyint(1) | NOT NULL | default=0
  has_errors | tinyint(1) | FK | NOT NULL | default=0
  error_notes | text
  calculated_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  (0 rows)

## payroll_summary_rocketology
  id | int | PK | NOT NULL
  payroll_run_id | int | FK | NOT NULL
  professor_id | int | FK | NOT NULL
  gusto_employee_id | varchar(10) | NOT NULL
  last_name | varchar(100) | NOT NULL
  first_name | varchar(100) | NOT NULL
  employment_title | varchar(100) | NOT NULL
  regular_hours | decimal(8,2) | NOT NULL | default=0.00
  bonus | decimal(10,2) | NOT NULL | default=0.00
  reimbursement | decimal(10,2) | NOT NULL | default=0.00
  pto_hours | decimal(6,2) | NOT NULL | default=0.00
  sick_hours | decimal(6,2) | NOT NULL | default=0.00
  live_program_pay | decimal(10,2) | NOT NULL | default=0.00
  party_pay | decimal(10,2) | NOT NULL | default=0.00
  misc_pay | decimal(10,2) | NOT NULL | default=0.00
  onboarding_pay | decimal(10,2) | NOT NULL | default=0.00
  total_gross_pay | decimal(10,2) | NOT NULL | default=0.00
  total_reimbursement | decimal(10,2) | NOT NULL | default=0.00
  has_missing_assist_pay | tinyint(1) | NOT NULL | default=0
  has_errors | tinyint(1) | FK | NOT NULL | default=0
  error_notes | text
  calculated_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  (0 rows)

## poc_title
  id | int | PK | NOT NULL
  poc_title_name | char(128) | UNIQUE | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (10 rows)

## professor
  id | int | PK | NOT NULL
  professor_nickname | char(255) | UNIQUE | NOT NULL
  professor_status_id | int | FK | NOT NULL
  first_name | char(64) | NOT NULL
  last_name | char(64) | NOT NULL
  email | char(128)
  phone_number | char(128)
  address | char(255)
  city_id | int | FK
  general_notes | varchar(1024)
  availability_notes | varchar(1024)
  emergency_contact | char(128)
  emergency_contact_number | char(128)
  birthday | date
  hire_date | date
  termination_date | date
  termination_rason | char(255)
  schedule_link | char(64)
  base_pay | decimal(10,2)
  assist_pay | decimal(10,2)
  pickup_pay | decimal(10,2)
  party_pay | decimal(10,2)
  camp_pay | decimal(10,2)
  science_trained_id | tinyint(1) | FK
  engineering_trained_id | tinyint(1) | FK
  show_party_trained_id | tinyint(1) | FK
  scheduling_coordinator_owner_id | int | FK
  studysmart_trained_id | tinyint(1) | FK
  camp_trained_id | tinyint(1) | FK
  virtus | tinyint(1) | NOT NULL
  virtus_date | date
  tb_test | tinyint(1) | NOT NULL
  tb_date | date
  rating | decimal(5,2)
  onboard_status_id | int | FK
  number_of_subs_claimed | int
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  geographic_area | varchar(128)
  robotics_trained_id | tinyint
  geographic_area_id | int
  user_id | int
  last_evaluation_date | date
  last_evaluation_result | varchar(20)
  (766 rows)

## professor_evaluation
  id | int | PK | NOT NULL
  professor_id | int | FK | NOT NULL
  evaluation_date | date | FK | NOT NULL
  evaluator_professor_id | int
  evaluator_user_id | int
  evaluation_type | enum('initial','routine','follow_up','formal','peer_to_peer','support_session') | default=formal
  result | enum('pass','needs_improvement','fail')
  form_link | varchar(1024)
  notes | varchar(1024)
  active | tinyint(1) | default=1
  ts_inserted | timestamp | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | default=CURRENT_TIMESTAMP
  form_status | enum('pending','completed','deleted') | default=pending
  form_data | json
  delete_reason_id | int
  delete_notes | varchar(512)
  remediation_followup | varchar(30)
  remediation_due_date | date
  (713 rows)

## professor_observation
  id | int | PK | NOT NULL
  professor_id | int | FK | NOT NULL
  program_id | int | FK | NOT NULL
  observation_date | date | FK | NOT NULL
  observation_type | enum('observation','evaluation') | default=observation
  pay_amount | decimal(10,2)
  is_paid | tinyint(1) | default=1
  status | enum('scheduled','completed','cancelled') | default=scheduled
  notes | varchar(512)
  assigned_by_user_id | int
  completed_at | datetime
  active | tinyint(1) | default=1
  ts_inserted | timestamp | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | default=CURRENT_TIMESTAMP
  form_status | enum('pending','completed','deleted') | default=pending
  form_data | json
  delete_reason_id | int
  delete_notes | varchar(512)
  remediation_followup | varchar(30)
  remediation_due_date | date
  (0 rows)

## professor_status
  id | int | PK | NOT NULL
  professor_status_name | char(64) | UNIQUE | NOT NULL
  professor_active | tinyint(1) | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (5 rows)

## program
  id | int | PK | NOT NULL
  program_nickname | char(255) | UNIQUE | NOT NULL
  class_status_id | int | FK
  location_id | int | FK
  live | tinyint(1) | NOT NULL | default=1
  class_id | int | FK
  start_time | time
  class_length_minutes | int
  monday | tinyint(1) | NOT NULL | default=0
  tuesday | tinyint(1) | NOT NULL | default=0
  wednesday | tinyint(1) | NOT NULL | default=0
  thursday | tinyint(1) | NOT NULL | default=0
  friday | tinyint(1) | NOT NULL | default=0
  saturday | tinyint(1) | NOT NULL | default=0
  sunday | tinyint(1) | NOT NULL | default=0
  general_notes | varchar(1024)
  parent_cost | decimal(10,2)
  our_cut | decimal(10,2)
  lab_fee | decimal(10,2)
  number_enrolled | int
  session_count | int | NOT NULL | default=0
  minimum_students | int
  maximum_students | int
  roster_received | tinyint(1) | NOT NULL | default=0
  roster_confirmed | tinyint(1) | NOT NULL | default=0
  roster_notes | varchar(1024)
  degrees_printed | varchar(64)
  payment_through_us | tinyint(1) | NOT NULL | default=0
  invoice_date_sent | date
  invoice_paid | tinyint(1) | NOT NULL | default=0
  invoice_notes | varchar(1024)
  contract_permit_required_id | int | FK
  special_info_required | varchar(1024)
  lead_professor_id | int | FK
  lead_professor_pay | decimal(10,2)
  tb_required | tinyint(1) | NOT NULL | default=0
  livescan_required | tinyint(1) | NOT NULL | default=0
  virtus_required | tinyint(1) | NOT NULL | default=0
  roster_link | varchar(1024)
  demo_required | tinyint(1) | NOT NULL | default=0
  demo_date | date
  demo_start_time | time
  demo_end_time | time
  demo_type_id | int | FK
  demo_pay | int
  demo_professor_id | int | FK
  demo_notes | varchar(1024)
  flyer_required | tinyint(1) | NOT NULL | default=0
  flyer_made | date
  flyer_sent_electronic | date
  flyer_dropped_physical | date
  flyer_dropped_physical_notes | varchar(1024)
  registration_opened_online | date
  open_blast_sent | tinyint(1) | NOT NULL | default=0
  open_blast_sent_notes | varchar(1024)
  two_week_blast_sent | tinyint(1) | NOT NULL | default=0
  two_week_blast_sent_notes | varchar(1024)
  one_week_blast_sent | tinyint(1) | NOT NULL | default=0
  one_week_blast_sent_notes | varchar(1024)
  final_blast_sent | tinyint(1) | NOT NULL | default=0
  final_blast_sent_notes | varchar(1024)
  parent_feedback_requested | tinyint(1) | NOT NULL | default=0
  parent_id | int | FK
  shirt_size | char(64)
  glow_slime_amount_needed | int
  calendar_event | varchar(1024)
  materials_prepared | int
  details_confirmed | date
  invoice_needed | tinyint(1) | default=0
  how_heard | char(32)
  lead_professor_drive_fee | decimal(10,2)
  lead_professor_tip | decimal(10,2)
  lead_professor_dry_ice | decimal(10,2)
  lead_reimbursements_paid | tinyint(1) | default=0
  assistant_required | tinyint(1) | default=0
  assistant_professor_id | int | FK
  assistant_professor_pay | decimal(10,2)
  assistant_professor_drive_fee | decimal(10,2)
  assistant_professor_tip | decimal(10,2)
  assistant_professor_dry_ice | decimal(10,2)
  assistant_reimbursements_paid | tinyint(1) | default=0
  base_party_price | decimal(10,2)
  drive_fee | decimal(10,2)
  late_booking_fee | decimal(10,2)
  total_kids_attended | int
  extra_kids_fee | decimal(10,2)
  extra_time_fee | decimal(10,2)
  deposit_date | date
  deposit_amount | decimal(10,2)
  total_party_cost | decimal(10,2)
  emailed_follow_up | date
  charge_confirmed | tinyint(1) | default=0
  final_charge_date | date
  final_charge_type | varchar(1024)
  expected_margin | decimal(8,4)
  first_session_date | date
  last_session_date | date
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  party_format_id | int
  party_location_text | varchar(255)
  (6018 rows)

## program_cut_type
  id | int | PK | NOT NULL
  program_id | int | FK | NOT NULL
  our_cut_type_id | int | FK | NOT NULL
  amount | decimal(10,2)
  description | char(255)
  active | tinyint(1) | NOT NULL | default=1
  (0 rows)

## program_grade
  id | int | PK | NOT NULL
  program_id | int | FK | NOT NULL
  grade_id | int | FK | NOT NULL
  age_min | decimal(3,1)
  age_max | decimal(3,1)
  (15907 rows)

## program_roster
  id | int | PK | NOT NULL
  program_id | int | FK | NOT NULL
  student_id | int | FK | NOT NULL
  grade_id | int | FK
  age | int
  gender | char(4)
  date_applied | date | NOT NULL
  date_dropped | date
  weeks_attended | int
  student_lab_fee | char(255)
  notes | char(255)
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  (16490 rows)

## program_session_pay
  id | int | PK | NOT NULL
  program_id | int | FK | NOT NULL
  session_id | int
  session_date | date | FK | NOT NULL
  lesson_name | varchar(200)
  role | enum('Lead','Assistant') | NOT NULL
  professor_id | int | FK | NOT NULL
  is_substitute | tinyint(1) | NOT NULL | default=0
  pay_amount | decimal(8,2) | NOT NULL | default=0.00
  pay_source | enum('special_date','location_base','professor_base','manual','session') | NOT NULL
  assist_pay_flag | enum('OK','MISSING') | FK | NOT NULL | default=OK
  class_hours | decimal(4,2) | NOT NULL
  regular_pay_component | decimal(8,2) | NOT NULL
  bonus_component | decimal(8,2) | NOT NULL
  reimbursement_amount | decimal(8,2) | NOT NULL | default=0.00
  generated_by | enum('nightly_job','manual') | NOT NULL | default=nightly_job
  edited_at | datetime
  edited_by | varchar(100)
  created_at | datetime | NOT NULL | default=CURRENT_TIMESTAMP
  (83 rows)

## program_type
  id | int | PK | NOT NULL
  program_type_name | char(64) | UNIQUE | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (6 rows)

## region
  id | int | PK | NOT NULL
  region_name | char(64) | UNIQUE | NOT NULL
  sort_order | int | default=0
  active | tinyint(1) | NOT NULL | default=1
  (7 rows)

## report
  id | int | PK | NOT NULL
  name | varchar(200) | NOT NULL
  description | text
  entity | varchar(50) | NOT NULL
  filters | json
  display_mode | enum('task','kpi','both') | NOT NULL | default=task
  kpi_format | enum('count','sum','list') | default=count
  kpi_field | varchar(100)
  sort_order | int | default=0
  created_by | varchar(100)
  active | tinyint(1) | NOT NULL | default=1
  created_at | datetime | default=CURRENT_TIMESTAMP
  updated_at | datetime | default=CURRENT_TIMESTAMP
  (7 rows)

## report_field_config
  id | int | PK | NOT NULL
  entity | varchar(64) | FK | NOT NULL
  field_key | varchar(64) | NOT NULL
  enabled | tinyint(1) | NOT NULL | default=1
  (0 rows)

## report_role
  id | int | PK | NOT NULL
  report_id | int | FK | NOT NULL
  role_id | int | NOT NULL
  (7 rows)

## report_user
  id | int | PK | NOT NULL
  report_id | int | FK | NOT NULL
  user_id | int | NOT NULL
  (4 rows)

## review
  id | int | PK | NOT NULL
  professor_id | int | FK | NOT NULL
  review_date | date
  notes | varchar(1024)
  link | varchar(1024)
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  (563 rows)

## role
  id | int | PK | NOT NULL
  role_name | char(64) | UNIQUE | NOT NULL
  active | tinyint(1) | NOT NULL | default=1
  (17 rows)

## session
  id | int | PK | NOT NULL
  program_id | int | FK | NOT NULL
  lesson_id | int | FK
  professor_id | int | FK
  professor_pay | decimal(10,2)
  assistant_id | int | FK
  assistant_pay | decimal(10,2)
  session_date | date | NOT NULL
  session_time | time
  specific_notes | varchar(1024)
  not_billed | tinyint(1) | NOT NULL | default=0
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  (36263 rows)

## session_roster
  id | int | PK | NOT NULL
  session_id | int | FK | NOT NULL
  program_roster_id | int | FK | NOT NULL
  notes | char(255)
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  (0 rows)

## state
  id | int | PK | NOT NULL
  state_name | char(64) | UNIQUE | NOT NULL
  state_code | char(2) | UNIQUE | NOT NULL
  (52 rows)

## student
  id | int | PK | NOT NULL
  first_name | char(64)
  last_name | char(64)
  birthday | date
  current_grade_id | int
  city_id | int | FK
  location_id | int
  address | char(128)
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  (21450 rows)

## student_parent
  id | int | PK | NOT NULL
  student_id | int | FK | NOT NULL
  parent_id | int | FK | NOT NULL
  parent_role_id | int | FK | NOT NULL
  notes | char(255)
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  (434 rows)

## substitute_reason
  id | int | PK | NOT NULL
  reason_name | varchar(100) | NOT NULL
  sort_order | int | default=0
  active | tinyint(1) | default=1
  (8 rows)

## tool
  id | int | PK | NOT NULL
  path | varchar(128) | UNIQUE | NOT NULL
  label | varchar(128) | NOT NULL
  nav_group | varchar(64)
  sort_order | int | default=0
  universal | tinyint(1) | default=0
  active | tinyint(1) | default=1
  (29 rows)

## tool_role
  id | int | PK | NOT NULL
  tool_id | int | FK | NOT NULL
  role_id | int | NOT NULL
  (27 rows)

## user
  id | int | PK | NOT NULL
  first_name | char(64) | NOT NULL
  last_name | char(64) | NOT NULL
  email | char(128) | UNIQUE | NOT NULL
  user_name | char(64) | UNIQUE | NOT NULL
  password | char(64) | NOT NULL
  role_id | int | FK
  ts_inserted | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  active | tinyint(1) | NOT NULL | default=1
  google_id | varchar(255)
  google_refresh_token | text
  last_login_at | datetime
  (30 rows)

## user_column_preference
  id | int | PK | NOT NULL
  user_id | int | FK | NOT NULL
  page_key | varchar(64) | NOT NULL
  visible_columns | json | NOT NULL
  ts_updated | timestamp | NOT NULL | default=CURRENT_TIMESTAMP
  (0 rows)

## weekday
  id | int | PK | NOT NULL
  weekday_name | char(16) | UNIQUE | NOT NULL
  (7 rows)

