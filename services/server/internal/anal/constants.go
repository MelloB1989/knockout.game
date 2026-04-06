package anal

type Events string

const (
	// Auth events
	USER_LOGIN           Events = "login"
	USER_SIGNUP          Events = "signup"
	USER_ONBOARDED       Events = "onboarded"
	USER_PROFILE_UPDATED Events = "profile_updated"

	// Errors
	SERVER_ERROR     Events = "$exception"
	BAD_REQUEST_400  Events = "bad_request_400"
	UNAUTHORIZED_401 Events = "unauthorized_401"
	SERVER_ERROR_500 Events = "server_error_500"

	// Game events

	// DB issues
	DB_CONNECTION_ISSUE Events = "db_connection_issue"
)

type Properties string

const (
	// User specific
	USER_ID      Properties = "uid"
	USER_PHONE   Properties = "phone"
	USER_EMAIL   Properties = "email"
	USER_GENDER  Properties = "gender"
	USER_NAME    Properties = "name"
	USER_PFP     Properties = "pfp"
	USER_PLAN    Properties = "user_plan"
	USER_IP      Properties = "user_ip"
	USER_COUNTRY Properties = "user_country"
	USER_CITY    Properties = "user_city"

	// Errors
	ERROR_LIST        Properties = "$exception_list"
	ERROR_FINGERPRINT Properties = "$exception_fingerprint"
	ERROR_TYPE        Properties = "fail_type"
)
